// ======================================================
// scripts/generate-extent-report.js
// ======================================================

const fs   = require('fs');
const path = require('path');

function esc(str) {
    return String(str || '')
        .replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function escJs(str) {
    return String(str || '').replace(/\\/g,'\\\\').replace(/`/g,'\\`').replace(/\$/g,'\\$');
}
function fmtJson(str) {
    try { return JSON.stringify(JSON.parse(str), null, 2); } catch { return String(str||''); }
}

// ── SVG pie helper ─────────────────────────────────────
function buildPie(num, den, passColor, failColor) {
    const cx=90, cy=90, r=80;
    if (den===0) return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#30363d"/>`;
    if (num===den) return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${passColor}"/>`;
    if (num===0)   return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${failColor}"/>`;
    const a = (num/den) * 2 * Math.PI;
    const x1=cx+r*Math.cos(-Math.PI/2),       y1=cy+r*Math.sin(-Math.PI/2);
    const x2=cx+r*Math.cos(-Math.PI/2+a),     y2=cy+r*Math.sin(-Math.PI/2+a);
    const x3=cx+r*Math.cos(-Math.PI/2+a),     y3=cy+r*Math.sin(-Math.PI/2+a);
    const lg = a>Math.PI ? 1 : 0;
    return `<path d="M${cx},${cy} L${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${lg},1 ${x2.toFixed(2)},${y2.toFixed(2)} Z" fill="${passColor}"/>` +
           `<path d="M${cx},${cy} L${x3.toFixed(2)},${y3.toFixed(2)} A${r},${r} 0 ${lg===1?0:1},1 ${x1.toFixed(2)},${y1.toFixed(2)} Z" fill="${failColor}"/>`;
}

function generateExtentReport(reportFolder, evidenceData, meta) {

    if (!evidenceData || evidenceData.length === 0) {
        console.log('⚠️  No evidence data for Extent report'); return;
    }

    // ── sanitise: remove ghost/unknown API entries ─────
    evidenceData = evidenceData.map(function(iter) {
        return Object.assign({}, iter, {
            apis: (iter.apis || []).filter(function(api) {
                const hasResult =
                    api.result !== null &&
                    api.result !== undefined &&
                    api.result !== 'UNKNOWN';
                const hasStatus =
                    api.statusCode !== null &&
                    api.statusCode !== undefined &&
                    String(api.statusCode).trim() !== '';
                return hasResult && hasStatus;
            })
        });
    });
    evidenceData = evidenceData.filter(function(iter) { return iter.apis.length > 0; });
    if (evidenceData.length === 0) {
        console.log('⚠️  No valid API data after sanitisation — skipping Extent report'); return;
    }

    // ── counts ─────────────────────────────────────────
    const total  = evidenceData.length;
    const passed = evidenceData.filter(d => !d.apis.some(a => a.result === 'FAILED')).length;
    const failed = total - passed;
    let totalApis=0,passApis=0,failApis=0,totalAssert=0,passAssert=0,failAssert=0;
    evidenceData.forEach(iter => {
        iter.apis.forEach(api => {
            totalApis++; api.result==='PASSED' ? passApis++ : failApis++;
            (api.assertions||[]).forEach(a => { totalAssert++; a.passed ? passAssert++ : failAssert++; });
        });
    });
    const passRate  = total > 0 ? Math.round((passed/total)*100) : 0;
    const donutPass = total > 0 ? Math.round((passed/total)*251.2) : 0;
    const donutFail = 251.2 - donutPass;
    const startStr  = meta?.startTime    ? new Date(meta.startTime).toLocaleString()   : new Date().toLocaleString();
    const endStr    = meta?.endTime      ? new Date(meta.endTime).toLocaleString()     : new Date().toLocaleString();
    const durStr    = meta?.totalDuration ? `${(meta.totalDuration/1000).toFixed(2)}s` : '—';
    const colName   = esc(meta?.collectionName || 'Newman Tests');
    const folName   = esc(meta?.folderName     || 'All Tests');

    // ── file attachments (base64) ──────────────────────
    let dataFileB64='', dataFileName='', dataFileMime='';
    const _dataPath = (meta && meta.dataFilePath) ? meta.dataFilePath : null;
    if (_dataPath) {
        try {
            if (fs.existsSync(_dataPath)) {
                const buf = fs.readFileSync(_dataPath);
                dataFileB64  = buf.toString('base64');
                dataFileName = path.basename(_dataPath);
                dataFileMime = _dataPath.endsWith('.xlsx')
                    ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                    : 'text/csv';
                console.log(`📎 Data file embedded in report: ${_dataPath}`);
            } else {
                console.log(`⚠️  Data file not found for embedding: ${_dataPath}`);
            }
        } catch(e) {
            console.log(`⚠️  Could not embed data file: ${e.message}`);
        }
    } else {
        console.log('ℹ️  No data file path provided — attachment skipped');
    }

    let evidenceB64='', evidenceFileName='', evidenceMime='';
    const _evPath = (meta && meta.evidenceFile) ? meta.evidenceFile : null;
    if (_evPath) {
        try {
            if (fs.existsSync(_evPath)) {
                const buf = fs.readFileSync(_evPath);
                evidenceB64  = buf.toString('base64');
                evidenceFileName = path.basename(_evPath);
                evidenceMime = _evPath.endsWith('.docx')
                    ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                    : 'text/plain';
                console.log(`📎 Evidence file embedded in report: ${_evPath}`);
            } else {
                console.log(`⚠️  Evidence file not found for embedding: ${_evPath}`);
            }
        } catch(e) {
            console.log(`⚠️  Could not embed evidence file: ${e.message}`);
        }
    } else {
        console.log('ℹ️  No evidence file path provided — attachment skipped');
    }

    function scenarioBadge(type, sm) {
        if (!type||!type.trim()) return '';
        const t=type.trim();
        const cls = t.toLowerCase()==='positive'?'sc-pos':t.toLowerCase()==='negative'?'sc-neg':'sc-oth';
        return `<span class="sc-badge ${cls}" style="font-size:${sm?'9px':'10px'}">${esc(t)}</span>`;
    }

    // ── download payloads ──────────────────────────────
    const dlPayloads = evidenceData.map(iter => {
        const ok=!iter.apis.some(a=>a.result==='FAILED');
        const L='='.repeat(80), D='-'.repeat(60);
        let t=`${L}\nTEST CASE NAME : ${iter.testCaseName||'Iteration '+iter.iteration}\nITERATION      : ${iter.iteration}\n`;
        if(iter.scenarioType) t+=`SCENARIO TYPE  : ${iter.scenarioType}\n`;
        t+=`OVERALL RESULT : ${ok?'PASSED':'FAILED'}\n${L}\n\n`;
        iter.apis.forEach((api,i)=>{
            t+=`${D}\nAPI #${i+1} : ${api.apiName||'Unknown'}\n${D}\n`;
            t+=`Method : ${api.method||''}\nURL : ${api.url||''}\nStatus : ${api.statusCode||''}\nTime : ${api.responseTime||0}ms\nResult : ${api.result||''}\n\nASSERTIONS\n`;
            (api.assertions||[]).forEach(a=>{
                t+=`  [${a.passed?'PASS':'FAIL'}] ${a.name}`;
                if(!a.passed&&a.error) t+=`  → ${a.error}`;
                t+='\n';
            });
            t+=`\nREQUEST BODY\n${fmtJson(api.requestBody)||'(empty)'}\n\nRESPONSE BODY\n${fmtJson(api.responseBody)||'(empty)'}\n\n`;
        });
        t+=`${L}\n`;
        return escJs(t);
    });
    const dlNames = evidenceData.map((d,i)=>{
        const safe=(d.testCaseName||'Iteration_'+i).replace(/[^a-zA-Z0-9_\- ]/g,'_').replace(/\s+/g,'_').substring(0,50);
        return `Iter_${i}_${safe}.txt`;
    });

    // ── sidebar items ──────────────────────────────────
    const sidebarItems = evidenceData.map((iter,idx)=>{
        const ok=!iter.apis.some(a=>a.result==='FAILED');
        const cls=ok?'pass':'fail';
        return `
        <div class="si ${cls}" id="si-${idx}" data-status="${cls}" data-name="${esc(iter.testCaseName||'')}" onclick="showTest(${idx})">
            <span class="si-num">${iter.iteration+1}</span>
            <div class="si-mid">
                <span class="si-name">${esc(iter.testCaseName||'Iteration '+(iter.iteration+1))}</span>
                ${iter.scenarioType?`<span class="si-scenario ${iter.scenarioType.toLowerCase()==='positive'?'sc-pos':iter.scenarioType.toLowerCase()==='negative'?'sc-neg':'sc-oth'}">${esc(iter.scenarioType)}</span>`:''}
            </div>
            <span class="si-res ${cls}">${ok?'PASSED':'FAILED'}</span>
        </div>`;
    }).join('');

    // ── test panels ────────────────────────────────────
    const panelsHtml = evidenceData.map((iter,idx)=>{
        const ok=!iter.apis.some(a=>a.result==='FAILED');
        const cls=ok?'pass':'fail';
        const label=ok?'PASSED':'FAILED';
        const apiHtml = iter.apis.map((api,ai)=>{
            const aok=api.result==='PASSED';
            const acls=aok?'pass':'fail';
            const mcls=(api.method||'GET').toLowerCase();
            const grp=`g-${idx}-${ai}`;
            const assertRows=(api.assertions||[]).map(a=>`
                <tr class="${a.passed?'arow-p':'arow-f'}">
                    <td class="ai">${a.passed?'✔':'✖'}</td>
                    <td>${esc(a.name)}</td>
                    <td>${a.passed?'<span class="b-pass">PASSED</span>':'<span class="b-fail">FAILED</span>'}</td>
                    <td class="a-err">${esc(a.error||'')}</td>
                </tr>`).join('');
            const assertTbl=(api.assertions&&api.assertions.length)
                ?`<table class="atbl"><thead><tr><th></th><th>Assertion</th><th>Result</th><th>Error</th></tr></thead><tbody>${assertRows}</tbody></table>`
                :`<p class="no-assert">No assertions defined for this request.</p>`;
            const mkHdrRows=obj=>obj?Object.entries(obj).map(([k,v])=>`<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join(''):'';;
            const rqHdr=mkHdrRows(api.requestHeaders);
            const rsHdr=mkHdrRows(api.responseHeaders);
            const hdrTab=(rqHdr||rsHdr)?`
                <div class="hdr-row">
                    ${rqHdr?`<div class="hdr-blk"><div class="hdr-lbl">Request Headers</div><table class="hdrt"><thead><tr><th>Key</th><th>Value</th></tr></thead><tbody>${rqHdr}</tbody></table></div>`:''}
                    ${rsHdr?`<div class="hdr-blk"><div class="hdr-lbl">Response Headers</div><table class="hdrt"><thead><tr><th>Key</th><th>Value</th></tr></thead><tbody>${rsHdr}</tbody></table></div>`:''}
                </div>`:'';
            return `
            <div class="ab ${acls}" id="ab-${idx}-${ai}">
                <div class="ah" onclick="toggleApi('ab-${idx}-${ai}')">
                    <span class="mb ${mcls}">${esc(api.method||'GET')}</span>
                    <span class="a-name">${esc(api.apiName||'Unknown')}</span>
                    <span class="a-url">${esc(api.url||'')}</span>
                    <div class="a-meta">
                        <span class="sc ${aok?'sc-ok':'sc-err'}">${esc(String(api.statusCode||''))}</span>
                        ${api.responseTime?`<span class="rt">${api.responseTime}ms</span>`:''}
                        <span class="a-res ${acls}">${api.result||'UNKNOWN'}</span>
                        <span class="arrow">▼</span>
                    </div>
                </div>
                <div class="ab-body" style="display:none;">
                    <div class="tb">
                        <button class="tbb active" onclick="swTab(this,'asc-${idx}-${ai}','${grp}')">Assertions</button>
                        <button class="tbb"        onclick="swTab(this,'rqb-${idx}-${ai}','${grp}')">Request Body</button>
                        <button class="tbb"        onclick="swTab(this,'rsb-${idx}-${ai}','${grp}')">Response Body</button>
                        ${(rqHdr||rsHdr)?`<button class="tbb" onclick="swTab(this,'hdr-${idx}-${ai}','${grp}')">Headers</button>`:''}
                    </div>
                    <div class="tc" id="asc-${idx}-${ai}" data-grp="${grp}">${assertTbl}</div>
                    <div class="tc" id="rqb-${idx}-${ai}" data-grp="${grp}" style="display:none;">
                        ${(api.requestBody&&api.requestBody.trim())
                            ?`<div class="copy-wrap"><button class="copy-btn" onclick="copyBody(this)" title="Copy to clipboard">⧉ Copy</button><pre class="cb json-body">${esc(fmtJson(api.requestBody))}</pre></div>`
                            :`<p class="no-body-msg">⚠ No request body for this request</p>`}
                    </div>
                    <div class="tc" id="rsb-${idx}-${ai}" data-grp="${grp}" style="display:none;">
                        ${(api.responseBody&&api.responseBody.trim())
                            ?`<div class="copy-wrap"><button class="copy-btn" onclick="copyBody(this)" title="Copy to clipboard">⧉ Copy</button><pre class="cb json-body">${esc(fmtJson(api.responseBody))}</pre></div>`
                            :`<p class="no-body-msg">⚠ No response body for this request</p>`}
                    </div>
                    ${(rqHdr||rsHdr)?`<div class="tc" id="hdr-${idx}-${ai}" data-grp="${grp}" style="display:none;">${hdrTab}</div>`:''}
                </div>
            </div>`;
        }).join('');
        return `
        <div class="tp" id="tp-${idx}" style="display:none;">
            <div class="tph ${cls}">
                <div class="tph-left">
                    <span class="tsb ${cls}">${label}</span>
                    <span class="t-name">${esc(iter.testCaseName||'Iteration '+iter.iteration)}</span>
                    ${scenarioBadge(iter.scenarioType,'md')}
                </div>
                <div class="tph-right">
                    <span class="t-meta">Iteration: ${iter.iteration}</span>
                    <span class="t-meta">${iter.apis.length} API${iter.apis.length!==1?'s':''}</span>
                    <button class="dl-btn" onclick="dlIter(${idx})">⬇&nbsp;Download</button>
                </div>
            </div>
            <div class="api-list">${apiHtml}</div>
        </div>`;
    }).join('');

    // ── summary page: overview table rows ─────────────
    const overviewRows = evidenceData.map((iter,idx)=>{
        const ok=!iter.apis.some(a=>a.result==='FAILED');
        const cls=ok?'pass':'fail';
        const iterAssertCount=iter.apis.reduce((s,a)=>s+(a.assertions||[]).length,0);

        // API sub-rows sit directly in the same <table> as the header
        // so colgroup widths apply to them automatically — perfect alignment.
        const apiSubRows=iter.apis.map((api,ai)=>{
            const aok=api.result==='PASSED';
            const mcls=(api.method||'get').toLowerCase();
            return `<tr class="ov-api-row" data-iter="${idx}" style="display:none;">
                <td class="ov-c1"></td>
                <td class="ov-c2 ov-api-cell">
                    <span class="ov-indent"></span>
                    <span class="mb ${mcls}" style="font-size:9px;min-width:50px;height:18px;">${esc(api.method||'GET')}</span>
                    <span class="ov-api-label">${esc(api.apiName||'')}</span>
                </td>
                <td class="ov-c3">
                    <span class="sc ${aok?'sc-ok':'sc-err'}">${esc(String(api.statusCode||''))}</span>
                </td>
                <td class="ov-c4">
                    ${aok?'<span class="b-pass">PASSED</span>':'<span class="b-fail">FAILED</span>'}
                </td>
                <td class="ov-c5 ov-muted">${api.responseTime||0}ms</td>
                <td class="ov-c6 ov-muted">${(api.assertions||[]).length}</td>
            </tr>`;
        }).join('');

        return `
        <tr class="ov-iter-row ${cls}" id="ovr-${idx}" onclick="toggleOvRow(${idx})">
            <td class="ov-c1"><span class="ov-num ${cls}">${iter.iteration+1}</span></td>
            <td class="ov-c2 ov-tc-name">
                <span class="ov-arrow" id="ova-${idx}">▶</span>
                ${esc(iter.testCaseName||'Iteration '+(iter.iteration+1))}
                ${iter.scenarioType?`<span class="si-scenario ${iter.scenarioType.toLowerCase()==='positive'?'sc-pos':iter.scenarioType.toLowerCase()==='negative'?'sc-neg':'sc-oth'}" style="margin-left:6px;font-size:9px;">${esc(iter.scenarioType)}</span>`:''}
            </td>
            <td class="ov-c3"></td>
            <td class="ov-c4">${ok?'<span class="b-pass">PASSED</span>':'<span class="b-fail">FAILED</span>'}</td>
            <td class="ov-c5 ov-muted">${iter.apis.length} API${iter.apis.length!==1?'s':''}</td>
            <td class="ov-c6 ov-muted">${iterAssertCount}</td>
        </tr>
        ${apiSubRows}`;
    }).join('');

    // ── attachment HTML ────────────────────────────────
    const dataAttHtml = dataFileB64
        ?`<div class="att-card">
            <div class="att-icon">📄</div>
            <div class="att-info">
                <div class="att-name">${esc(dataFileName)}</div>
                <div class="att-sub">Test Data File</div>
            </div>
            <div class="att-btns">
                <a class="att-btn" href="data:${dataFileMime};base64,${dataFileB64}" download="${esc(dataFileName)}">⬇ Download</a>
            </div>
          </div>`
        :`<p class="att-none">No test data file attached — set copyTestDataToReports=true in framework.properties</p>`;

    const evAttHtml = evidenceB64
        ?`<div class="att-card">
            <div class="att-icon">${evidenceFileName.endsWith('.docx')?'📝':'📃'}</div>
            <div class="att-info">
                <div class="att-name">${esc(evidenceFileName)}</div>
                <div class="att-sub">Execution Evidence</div>
            </div>
            <div class="att-btns">
                ${evidenceFileName.endsWith('.txt')?`<a class="att-btn att-view" href="data:text/plain;base64,${evidenceB64}" target="_blank">👁 View</a>`:''}
                <a class="att-btn" href="data:${evidenceMime};base64,${evidenceB64}" download="${esc(evidenceFileName)}">⬇ Download</a>
            </div>
          </div>`
        :`<p class="att-none">No evidence file found — run test with evidenceFormat=docx or txt</p>`;

    // ── HTML ───────────────────────────────────────────
    const html = `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${colName} — Extent Report</title>
<style>
/* ── dark vars ──────────────────────────────────────── */
:root{
    --bg:#0d1117;--bg2:#161b22;--bg3:#1c2128;--bg4:#21262d;
    --border:#30363d;--text:#e6edf3;--text2:#8b949e;--text3:#6e7681;
    --nav-bg:#010409;--card-bg:#21262d;--panel-bg:#161b22;
    --code-bg:#010409;--code-text:#e6edf3;
    --th-bg:#1c2128;--td-sep:#21262d;--scrollbar:#30363d;
    --tab-active:#58a6ff;--sb-bg:#161b22;--sb-hover:#1c2128;
    --sb-act-p:rgba(63,185,80,.15);--sb-act-f:rgba(248,81,73,.15);
    --btn-bg:#21262d;
}
/* ── light vars ─────────────────────────────────────── */
[data-theme="light"]{
    --bg:#f0f2f5;--bg2:#ffffff;--bg3:#e4e8ed;--bg4:#d8dde4;
    --border:#b0b8c4;--text:#0d1117;--text2:#3d454f;--text3:#5a6472;
    --nav-bg:#1a1f24;--card-bg:#ffffff;--panel-bg:#ffffff;
    --code-bg:#ffffff;--code-text:#24292e;
    --th-bg:#e4e8ed;--td-sep:#d0d7de;--scrollbar:#b0b8c4;
    --tab-active:#0550ae;--sb-bg:#f8f9fb;--sb-hover:#eaecf0;
    --sb-act-p:rgba(22,115,46,.14);--sb-act-f:rgba(180,28,28,.1);
    --btn-bg:#e4e8ed;
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'Segoe UI',system-ui,Arial,sans-serif;background:var(--bg);color:var(--text);font-size:15px;transition:background .2s,color .2s;}

/* ── navbar ─────────────────────────────────────────── */
.nav{background:var(--nav-bg);color:#fff;height:56px;padding:0 18px;display:flex;align-items:center;position:sticky;top:0;z-index:300;box-shadow:0 1px 0 rgba(255,255,255,.08);}
.nav-br
