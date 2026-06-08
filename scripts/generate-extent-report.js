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
            return `<tr class="ov-api-row">
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
.nav-brand{font-size:16px;font-weight:700;white-space:nowrap;}
.nav-brand span{color:#58a6ff;}
.nav-tabs{display:flex;margin-left:20px;}
.nav-tab{background:none;border:none;border-bottom:2px solid transparent;color:#8b949e;font-size:13px;font-weight:600;padding:0 16px;height:56px;cursor:pointer;transition:all .15s;white-space:nowrap;}
.nav-tab:hover{color:#fff;}
.nav-tab.active{color:#58a6ff;border-bottom-color:#58a6ff;}
.nav-right{display:flex;align-items:center;gap:14px;margin-left:auto;flex-wrap:wrap;}
.nav-meta{font-size:12px;color:#8b949e;display:flex;gap:14px;flex-wrap:wrap;}
.nav-meta b{color:#cdd9e5;}
.theme-btn{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);border-radius:20px;padding:4px 12px 4px 8px;cursor:pointer;font-size:12px;color:#cdd9e5;display:flex;align-items:center;gap:5px;white-space:nowrap;transition:background .15s;}
.theme-btn:hover{background:rgba(255,255,255,.15);}

/* ── pages ───────────────────────────────────────────── */
.page{display:none;}
.page.active{display:flex;flex-direction:column;}

/* ── dashboard ──────────────────────────────────────── */
.dash{background:var(--bg);padding:14px 18px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;border-bottom:1px solid var(--border);}
.dc{background:var(--card-bg);border:1px solid var(--border);border-radius:8px;padding:11px 16px;min-width:100px;text-align:center;}
.dc-n{font-size:26px;font-weight:700;line-height:1;}
.dc-l{font-size:11px;color:var(--text2);margin-top:3px;text-transform:uppercase;letter-spacing:.4px;}
.dc.tot .dc-n{color:#58a6ff;}.dc.pas .dc-n{color:#3fb950;}.dc.fai .dc-n{color:#f85149;}
.donut-wrap{margin-left:auto;display:flex;align-items:center;gap:12px;}
.donut-wrap svg{transform:rotate(-90deg);}
.di .rate{font-size:19px;font-weight:700;color:var(--text);}
.di .pl{color:#3fb950;font-size:11px;font-weight:600;}
.di .fl{color:#f85149;font-size:11px;font-weight:600;}

/* ── meta strip ─────────────────────────────────────── */
.ms{background:var(--bg2);border-bottom:1px solid var(--border);padding:7px 18px;display:flex;gap:22px;font-size:12px;color:var(--text2);flex-wrap:wrap;}
.ms b{color:var(--text);}

/* ── layout (tests page) ────────────────────────────── */
.layout{display:flex;flex:1;min-height:0;}

/* ── sidebar ────────────────────────────────────────── */
.sidebar{width:360px;min-width:260px;background:var(--sb-bg);border-right:1px solid var(--border);flex-shrink:0;display:flex;flex-direction:column;}
.sb-tabs{display:flex;border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--sb-bg);z-index:2;}
.sb-tab{flex:1;padding:9px 4px;font-size:12px;font-weight:600;text-align:center;cursor:pointer;border:none;background:none;color:var(--text2);border-bottom:2px solid transparent;transition:all .15s;}
.sb-tab:hover{background:var(--sb-hover);color:var(--text);}
.sb-tab.active{color:var(--text);border-bottom:2px solid var(--tab-active);}
.sb-tab.tab-pass.active{border-bottom-color:#3fb950;color:#3fb950;}
.sb-tab.tab-fail.active{border-bottom-color:#f85149;color:#f85149;}
.sb-cnt{display:inline-block;background:var(--bg3);border-radius:8px;padding:1px 6px;font-size:10px;margin-left:4px;font-weight:700;}
.tab-pass .sb-cnt{background:rgba(63,185,80,.15);color:#3fb950;}
.tab-fail .sb-cnt{background:rgba(248,81,73,.15);color:#f85149;}
.sb-list{overflow-y:auto;flex:1;}
.sb-search-wrap{padding:10px;position:relative;border-bottom:1px solid var(--border);background:var(--sb-bg);}
.sb-search{width:100%;padding:10px 12px;background:var(--bg2);color:var(--text);border:1px solid var(--border);border-radius:8px;font-size:13px;outline:none;transition:.2s;}
.sb-search:focus{border-color:#58a6ff;box-shadow:0 0 0 3px rgba(88,166,255,.15);}
.sb-search::placeholder{color:var(--text3);}
.sb-clear{position:absolute;right:18px;top:50%;transform:translateY(-50%);border:none;background:none;cursor:pointer;color:var(--text3);font-size:14px;}
.sb-clear:hover{color:#f85149;}
.si{padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border);display:grid;grid-template-columns:32px 1fr auto;align-items:center;gap:10px;transition:background .1s;}
.si:hover{background:var(--sb-hover);}
.si.pass.active{background:var(--sb-act-p);border-left:3px solid #3fb950;}
.si.fail.active{background:var(--sb-act-f);border-left:3px solid #f85149;}
.si-num{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;flex-shrink:0;}
.si.pass .si-num{background:rgba(63,185,80,.18);color:#3fb950;border:1px solid rgba(63,185,80,.35);}
.si.fail .si-num{background:rgba(248,81,73,.18);color:#f85149;border:1px solid rgba(248,81,73,.35);}
.si-name{font-size:13px;word-break:break-word;line-height:1.4;color:var(--text);font-weight:500;}
.si-mid{display:flex;flex-direction:column;gap:3px;min-width:0;}
.si-scenario{display:inline-block;font-size:10px;font-weight:700;padding:2px 7px;border-radius:3px;letter-spacing:.3px;text-transform:uppercase;align-self:flex-start;}
.si-res{font-size:10px;font-weight:700;padding:3px 8px;border-radius:10px;white-space:nowrap;flex-shrink:0;}
.si-res.pass{background:rgba(63,185,80,.15);color:#3fb950;border:1px solid rgba(63,185,80,.3);}
.si-res.fail{background:rgba(248,81,73,.15);color:#f85149;border:1px solid rgba(248,81,73,.3);}
.no-results{text-align:center;color:var(--text3);padding:24px 0;font-size:12px;font-style:italic;}

/* ── scenario badge ─────────────────────────────────── */
.sc-badge{font-weight:700;padding:2px 6px;border-radius:3px;letter-spacing:.3px;text-transform:uppercase;display:inline-block;}
.sc-pos{background:rgba(63,185,80,.15);color:#3fb950;border:1px solid rgba(63,185,80,.3);}
.sc-neg{background:rgba(248,81,73,.15);color:#f85149;border:1px solid rgba(248,81,73,.3);}
.sc-oth{background:rgba(139,148,158,.15);color:#8b949e;border:1px solid rgba(139,148,158,.3);}

/* ── content pane ───────────────────────────────────── */
.ct{flex:1;overflow-y:auto;padding:14px;background:var(--bg);}
.ph{text-align:center;color:var(--text3);margin-top:80px;font-size:14px;}
.ph-ico{font-size:44px;margin-bottom:10px;}

/* ── test panel ─────────────────────────────────────── */
.tp{border:1px solid var(--border);border-radius:8px;overflow:hidden;}
.tph{padding:12px 15px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;}
.tph.pass{background:rgba(63,185,80,.07);border-left:4px solid #3fb950;}
.tph.fail{background:rgba(248,81,73,.07);border-left:4px solid #f85149;}
.tph-left{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.tph-right{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
.t-name{font-size:15px;font-weight:600;color:var(--text);}
.tsb{padding:2px 9px;border-radius:3px;font-size:10px;font-weight:700;letter-spacing:.4px;}
.tsb.pass{background:#3fb950;color:#fff;}.tsb.fail{background:#f85149;color:#fff;}
.t-meta{font-size:12px;color:var(--text2);}
.dl-btn{background:var(--btn-bg);border:1px solid var(--border);border-radius:5px;padding:5px 12px;font-size:12px;cursor:pointer;color:var(--text);transition:all .12s;white-space:nowrap;}
.dl-btn:hover{background:var(--bg4);}

/* ── api accordion ──────────────────────────────────── */
.api-list{background:var(--panel-bg);}
.ab{border-bottom:1px solid var(--border);}
.ab:last-child{border-bottom:none;}
.ab.pass .ah{border-left:3px solid #3fb950;}.ab.fail .ah{border-left:3px solid #f85149;}
.ah{padding:9px 14px;display:flex;align-items:center;gap:8px;cursor:pointer;transition:background .1s;flex-wrap:wrap;}
.ah:hover{background:var(--bg3);}
.ah.open .arrow{transform:rotate(180deg);}
.mb{display:inline-flex;align-items:center;justify-content:center;min-width:62px;height:22px;padding:0 8px;font-size:10px;font-weight:700;border-radius:4px;text-transform:uppercase;letter-spacing:.4px;flex-shrink:0;}
.mb.get{background:rgba(88,166,255,.15);color:#58a6ff;}
.mb.post{background:rgba(63,185,80,.15);color:#3fb950;}
.mb.put{background:rgba(255,166,77,.15);color:#ffa64d;}
.mb.patch{background:rgba(188,140,255,.15);color:#bc8cff;}
.mb.delete{background:rgba(248,81,73,.15);color:#f85149;}
.a-name{font-weight:600;font-size:14px;color:var(--text);}
.a-url{font-size:11px;color:var(--text2);flex:1;word-break:break-all;}
.a-meta{display:flex;align-items:center;gap:7px;margin-left:auto;flex-shrink:0;}
.sc{font-size:11px;font-weight:700;padding:2px 7px;border-radius:3px;}
.sc-ok{background:rgba(63,185,80,.15);color:#3fb950;}
.sc-err{background:rgba(248,81,73,.15);color:#f85149;}
.rt{font-size:11px;color:var(--text3);}
.a-res{font-size:10px;font-weight:700;padding:2px 8px;border-radius:3px;}
.a-res.pass{background:#3fb950;color:#fff;}.a-res.fail{background:#f85149;color:#fff;}
.arrow{color:var(--text3);font-size:9px;transition:transform .18s;}
.ab-body{padding:0 14px 12px;border-top:1px solid var(--border);}
.tb{display:flex;align-items:center;gap:0;margin-top:10px;border-bottom:1px solid var(--border);}
.tbb{background:none;border:none;padding:9px 14px;font-size:12px;font-weight:600;color:var(--text2);cursor:pointer;border-bottom:2px solid transparent;transition:all .15s ease;}
.tbb:hover{background:var(--sb-hover);color:var(--text);}
.tbb.active{background:none;color:#58a6ff;border-bottom:2px solid #58a6ff;}
.tc{padding-top:8px;}

/* ── assertions ─────────────────────────────────────── */
.atbl{width:100%;border-collapse:collapse;table-layout:fixed;font-size:13px;}
.atbl th{background:var(--th-bg);padding:6px 10px;text-align:left;font-weight:600;color:var(--text2);border-bottom:2px solid var(--border);}
.atbl td{padding:7px 10px;border-bottom:1px solid var(--td-sep);vertical-align:top;color:var(--text);}
.atbl th:nth-child(1),.atbl td:nth-child(1){width:50px;text-align:center;}
.atbl th:nth-child(2),.atbl td:nth-child(2){width:50%;}
.atbl th:nth-child(3),.atbl td:nth-child(3){width:120px;text-align:center;}
.atbl th:nth-child(4),.atbl td:nth-child(4){width:auto;}
.arow-p .ai{color:#3fb950;}.arow-f .ai{color:#f85149;}
.arow-f{background:rgba(248,81,73,.04);}
.a-err{color:#f85149;font-size:12px;font-family:'Courier New',monospace;}
.b-pass{background:rgba(63,185,80,.15);color:#3fb950;padding:2px 8px;border-radius:3px;font-size:11px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;}
.b-fail{background:rgba(248,81,73,.15);color:#f85149;padding:2px 8px;border-radius:3px;font-size:11px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;}
.no-assert{color:var(--text3);font-size:13px;padding:10px 0;font-style:italic;}
.no-body-msg{color:var(--text3);font-size:13px;padding:14px 0;font-style:italic;display:flex;align-items:center;gap:6px;}

/* ── copy wrapper ───────────────────────────────────── */
.copy-wrap{position:relative;}
.copy-btn{position:absolute;top:8px;right:8px;z-index:10;background:var(--bg4);border:1px solid var(--border);border-radius:4px;padding:4px 10px;font-size:11px;cursor:pointer;color:var(--text2);transition:all .15s;opacity:.85;}
.copy-btn:hover{opacity:1;background:var(--tab-active);color:#fff;border-color:var(--tab-active);}
.copy-btn.copied{background:#3fb950;color:#fff;border-color:#3fb950;}
[data-theme="light"] .copy-btn{background:#f6f8fa;color:#24292e;border:1px solid #c9d1d9;font-weight:600;}
[data-theme="light"] .copy-btn:hover{background:#0969da;color:#ffffff;border-color:#0969da;}

/* ── code + JSON highlighting ───────────────────────── */
.cb{background:var(--code-bg);color:var(--code-text);padding:18px 20px;border:2px solid var(--border);border-left:5px solid var(--tab-active);border-radius:8px;font-size:14px;font-family:'Consolas','Courier New',monospace;font-weight:500;line-height:1.8;overflow-x:auto;overflow-y:auto;max-height:500px;white-space:pre-wrap;word-break:break-word;box-shadow:0 2px 8px rgba(0,0,0,.08);}
[data-theme="light"] .cb{background:#ffffff;border:1px solid #bfdbfe;border-left:4px solid #3b82f6;border-radius:8px;box-shadow:0 2px 6px rgba(59,130,246,.08);}
.jk{color:#79c0ff;}.js{color:#a5d6ff;}.jn{color:#f8c94a;}.jb{color:#ff7b72;}.jnl{color:#8b949e;}.jp{color:#6e7681;}
[data-theme="light"] .jk{color:#005cc5;font-weight:700;}
[data-theme="light"] .js{color:#22863a;}
[data-theme="light"] .jn{color:#d73a49;font-weight:600;}
[data-theme="light"] .jb{color:#6f42c1;font-weight:600;}
[data-theme="light"] .jnl{color:#6a737d;font-style:italic;}
[data-theme="light"] .jp{color:#24292e;}

/* ── headers ────────────────────────────────────────── */
.hdr-row{display:flex;gap:12px;flex-wrap:wrap;}
.hdr-blk{flex:1;min-width:240px;}
.hdr-lbl{font-size:10px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.4px;margin-bottom:5px;}
.hdrt{width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed;}
.hdrt th{background:var(--th-bg);padding:4px 9px;text-align:left;font-weight:600;border-bottom:1px solid var(--border);color:var(--text2);}
.hdrt th:first-child{width:38%;}.hdrt th:last-child{width:62%;}
.hdrt td{padding:4px 9px;border-bottom:1px solid var(--td-sep);word-break:break-all;color:var(--text);vertical-align:top;}

/* ── scrollbar ──────────────────────────────────────── */
::-webkit-scrollbar{width:5px;height:5px;}
::-webkit-scrollbar-track{background:transparent;}
::-webkit-scrollbar-thumb{background:var(--scrollbar);border-radius:3px;}

/* ═══════════════════════════════════════════════════════
   SUMMARY PAGE
   ═══════════════════════════════════════════════════════ */
.sum-page{overflow-y:auto;flex:1;padding:24px;background:var(--bg);}
.sum-card{background:var(--panel-bg);border:1px solid var(--border);border-radius:10px;margin-bottom:22px;overflow:hidden;}
.sum-card-hdr{padding:13px 20px;border-bottom:1px solid var(--border);background:var(--bg2);display:flex;align-items:center;gap:10px;}
.sum-card-title{font-size:15px;font-weight:700;color:var(--text);}
.sum-card-note{margin-left:auto;font-size:11px;color:var(--text3);font-style:italic;}
.sum-card-body{padding:20px;}
.sum-card-body-np{padding:0;}

/* ── pie charts ─────────────────────────────────────── */
.charts-row{display:flex;gap:32px;flex-wrap:wrap;justify-content:flex-start;}
.pie-block{display:flex;flex-direction:column;align-items:center;gap:12px;}
.pie-label{font-size:12px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.5px;}
.pie-legend{display:flex;gap:14px;flex-wrap:wrap;justify-content:center;}
.pie-leg{display:flex;align-items:center;gap:5px;font-size:12px;color:var(--text);}
.pie-dot{width:11px;height:11px;border-radius:50%;flex-shrink:0;}

/* ── summary stats table ─────────────────────────────── */
.sum-tbl{width:100%;border-collapse:collapse;font-size:14px;}
.sum-tbl th{background:var(--th-bg);padding:10px 16px;text-align:left;font-weight:700;color:var(--text2);border-bottom:2px solid var(--border);font-size:11px;text-transform:uppercase;letter-spacing:.4px;}
.sum-tbl th:nth-child(2),.sum-tbl th:nth-child(3){text-align:center;}
.sum-tbl td{padding:11px 16px;border-bottom:1px solid var(--td-sep);color:var(--text);}
.sum-tbl tr:last-child td{border-bottom:none;}
.sum-tbl td.num-total{font-weight:700;color:#58a6ff;text-align:center;}
.sum-tbl td.num-zero{color:var(--text3);text-align:center;}
.sum-tbl td.num-fail{font-weight:700;color:#f85149;text-align:center;}

/* ── attachments ────────────────────────────────────── */
.att-row{display:flex;gap:14px;flex-wrap:wrap;}
.att-card{display:flex;align-items:center;gap:14px;background:var(--card-bg);border:1px solid var(--border);border-radius:8px;padding:14px 18px;flex:1;min-width:260px;}
.att-icon{font-size:30px;flex-shrink:0;}
.att-info{flex:1;min-width:0;}
.att-name{font-size:13px;font-weight:600;color:var(--text);word-break:break-all;}
.att-sub{font-size:11px;color:var(--text2);margin-top:2px;}
.att-btns{display:flex;gap:8px;flex-shrink:0;}
.att-btn{display:inline-block;background:var(--btn-bg);border:1px solid var(--border);border-radius:5px;padding:6px 12px;font-size:12px;font-weight:600;color:var(--text);text-decoration:none;transition:all .15s;white-space:nowrap;}
.att-btn:hover{background:var(--tab-active);color:#fff;border-color:var(--tab-active);}
.att-btn.att-view{background:rgba(88,166,255,.12);color:#58a6ff;border-color:rgba(88,166,255,.3);}
.att-btn.att-view:hover{background:#58a6ff;color:#fff;}
.att-none{color:var(--text3);font-size:13px;font-style:italic;}

/* ── overview table ──────────────────────────────────── */
/* ── overview table ──────────────────────────────────── */
/* table-layout:fixed + colgroup = guaranteed alignment    */
/* between header, iter rows, and API sub-rows             */
.ov-tbl{width:100%;border-collapse:collapse;font-size:13px;table-layout:fixed;}
/* colgroup column widths — single source of truth */
.ov-c1{width:52px;}
.ov-c2{width:auto;}
.ov-c3{width:110px;}
.ov-c4{width:110px;}
.ov-c5{width:90px;}
.ov-c6{width:90px;}
/* header */
.ov-tbl th{background:var(--th-bg);padding:9px 12px;text-align:left;font-weight:700;color:var(--text2);border-bottom:2px solid var(--border);font-size:11px;text-transform:uppercase;letter-spacing:.4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.ov-th-ctr{text-align:center;}
/* iteration rows */
.ov-iter-row{cursor:pointer;transition:background .12s;}
.ov-iter-row:hover td{background:var(--sb-hover);}
.ov-iter-row td{padding:11px 12px;border-bottom:1px solid var(--td-sep);color:var(--text);vertical-align:middle;overflow:hidden;text-overflow:ellipsis;}
.ov-iter-row.pass{border-left:3px solid #3fb950;}
.ov-iter-row.fail{border-left:3px solid #f85149;}
/* iteration number circle */
.ov-num{width:26px;height:26px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;}
.ov-num.pass{background:rgba(63,185,80,.18);color:#3fb950;border:1px solid rgba(63,185,80,.35);}
.ov-num.fail{background:rgba(248,81,73,.18);color:#f85149;border:1px solid rgba(248,81,73,.35);}
.ov-arrow{display:inline-block;font-size:10px;color:var(--text3);margin-right:6px;transition:transform .18s;}
.ov-arrow.open{transform:rotate(90deg);}
.ov-tc-name,.ov-c1{text-align:center;}
.ov-c3,.ov-c4,.ov-c5,.ov-c6{text-align:center;}
/* API sub-rows — directly in same table, no nesting */
.ov-api-row td{padding:7px 12px;border-bottom:1px solid var(--td-sep);background:var(--bg3);color:var(--text);font-size:12px;vertical-align:middle;overflow:hidden;text-overflow:ellipsis;}
.ov-api-row:last-of-type td,.ov-iter-row + .ov-iter-row td{border-top:1px solid var(--border);}
.ov-api-row:hover td{background:var(--bg4);}
/* indent the API name to show hierarchy */
.ov-indent{display:inline-block;width:22px;flex-shrink:0;}
.ov-api-cell{display:table-cell;vertical-align:middle;}
.ov-api-label{font-weight:500;vertical-align:middle;margin-left:5px;}
.ov-muted{color:var(--text2);font-size:12px;}
</style>
</head>
<body>

<!-- NAVBAR -->
<div class="nav">
    <div class="nav-brand">${folName}&nbsp;<span>Report</span></div>
    <div class="nav-tabs">
        <button class="nav-tab active" id="ntab-tests"   onclick="switchPage('tests')">Tests</button>
        <button class="nav-tab"        id="ntab-summary" onclick="switchPage('summary')">Summary</button>
    </div>
    <div class="nav-right">
        <div class="nav-meta">
            <span><b>Collection:</b> ${colName}</span>
            <span><b>Generated:</b> ${new Date().toLocaleString()}</span>
        </div>
        <button class="theme-btn" id="theme-btn" onclick="toggleTheme()">
            <span id="theme-ico">☀️</span><span id="theme-lbl">Light Mode</span>
        </button>
    </div>
</div>

<!-- ══ TESTS PAGE ══════════════════════════════════════ -->
<div class="page active" id="page-tests">

    <div class="dash">
        <div class="dc tot"><div class="dc-n">${total}</div><div class="dc-l">Total</div></div>
        <div class="dc pas"><div class="dc-n">${passed}</div><div class="dc-l">Passed</div></div>
        <div class="dc fai"><div class="dc-n">${failed}</div><div class="dc-l">Failed</div></div>
        <div class="dc tot"><div class="dc-n">${totalApis}</div><div class="dc-l">APIs</div></div>
        <div class="dc tot"><div class="dc-n">${totalAssert}</div><div class="dc-l">Assertions</div></div>
        <div class="dc pas"><div class="dc-n">${passAssert}</div><div class="dc-l">Assert Pass</div></div>
        <div class="dc fai"><div class="dc-n">${failAssert}</div><div class="dc-l">Assert Fail</div></div>
        <div class="donut-wrap">
            <svg width="72" height="72" viewBox="0 0 90 90">
                <circle cx="45" cy="45" r="40" fill="none" stroke="#f85149" stroke-width="10"/>
                <circle cx="45" cy="45" r="40" fill="none" stroke="#3fb950" stroke-width="10"
                    stroke-dasharray="${donutPass} ${donutFail}"/>
            </svg>
            <div class="di">
                <div class="rate">${passRate}%</div>
                <div class="pl">✔ ${passed} Passed</div>
                <div class="fl">✖ ${failed} Failed</div>
            </div>
        </div>
    </div>

    <div class="ms">
        <span><b>Start:</b> ${startStr}</span>
        <span><b>End:</b> ${endStr}</span>
        <span><b>Duration:</b> ${durStr}</span>
        <span><b>Pass Rate:</b> ${passRate}%</span>
    </div>

    <div class="layout">
        <div class="sidebar">
            <div class="sb-search-wrap">
                <input type="text" id="testSearch" class="sb-search" placeholder="🔍 Search test case..." onkeyup="searchTests()"/>
                <button class="sb-clear" onclick="document.getElementById('testSearch').value='';searchTests();">✕</button>
            </div>
            <div class="sb-tabs">
                <button class="sb-tab active"   id="tab-all"  onclick="filterSidebar('all')">All<span class="sb-cnt">${total}</span></button>
                <button class="sb-tab tab-pass" id="tab-pass" onclick="filterSidebar('pass')">Passed<span class="sb-cnt">${passed}</span></button>
                <button class="sb-tab tab-fail" id="tab-fail" onclick="filterSidebar('fail')">Failed<span class="sb-cnt">${failed}</span></button>
            </div>
            <div class="sb-list" id="sb-list">${sidebarItems}</div>
        </div>
        <div class="ct" id="ct">
            <div class="ph" id="ph">
                <div class="ph-ico">📋</div>
                <div>Select a test case from the left to view details</div>
            </div>
            ${panelsHtml}
        </div>
    </div>

</div>

<!-- ══ SUMMARY PAGE ════════════════════════════════════ -->
<div class="page" id="page-summary">
<div class="sum-page">

    <!-- PIE CHARTS -->
    <div class="sum-card">
        <div class="sum-card-hdr"><span>📊</span><span class="sum-card-title">Test Results Overview</span></div>
        <div class="sum-card-body">
            <div class="charts-row">

                <!-- Iterations -->
                <div class="pie-block">
                    <div class="pie-label">Iterations</div>
                    <svg width="180" height="180" viewBox="0 0 180 180">
                        ${buildPie(passed,total,'#3fb950','#f85149')}
                        <circle cx="90" cy="90" r="46" fill="var(--panel-bg)"/>
                        <text x="90" y="87" text-anchor="middle" font-size="22" font-weight="800" fill="var(--text)">${passRate}%</text>
                        <text x="90" y="105" text-anchor="middle" font-size="11" fill="var(--text2)">Pass Rate</text>
                    </svg>
                    <div class="pie-legend">
                        <div class="pie-leg"><div class="pie-dot" style="background:#3fb950"></div>${passed} Passed</div>
                        <div class="pie-leg"><div class="pie-dot" style="background:#f85149"></div>${failed} Failed</div>
                    </div>
                </div>

                <!-- API Calls -->
                <div class="pie-block">
                    <div class="pie-label">API Calls</div>
                    <svg width="180" height="180" viewBox="0 0 180 180">
                        ${buildPie(passApis,totalApis,'#3fb950','#f85149')}
                        <circle cx="90" cy="90" r="46" fill="var(--panel-bg)"/>
                        <text x="90" y="87" text-anchor="middle" font-size="22" font-weight="800" fill="var(--text)">${totalApis}</text>
                        <text x="90" y="105" text-anchor="middle" font-size="11" fill="var(--text2)">Total APIs</text>
                    </svg>
                    <div class="pie-legend">
                        <div class="pie-leg"><div class="pie-dot" style="background:#3fb950"></div>${passApis} Passed</div>
                        <div class="pie-leg"><div class="pie-dot" style="background:#f85149"></div>${failApis} Failed</div>
                    </div>
                </div>

                <!-- Assertions -->
                <div class="pie-block">
                    <div class="pie-label">Assertions</div>
                    <svg width="180" height="180" viewBox="0 0 180 180">
                        ${buildPie(passAssert,totalAssert,'#3fb950','#f85149')}
                        <circle cx="90" cy="90" r="46" fill="var(--panel-bg)"/>
                        <text x="90" y="87" text-anchor="middle" font-size="22" font-weight="800" fill="var(--text)">${totalAssert}</text>
                        <text x="90" y="105" text-anchor="middle" font-size="11" fill="var(--text2)">Total</text>
                    </svg>
                    <div class="pie-legend">
                        <div class="pie-leg"><div class="pie-dot" style="background:#3fb950"></div>${passAssert} Passed</div>
                        <div class="pie-leg"><div class="pie-dot" style="background:#f85149"></div>${failAssert} Failed</div>
                    </div>
                </div>

            </div>
        </div>
    </div>

    <!-- EXECUTION SUMMARY TABLE -->
    <div class="sum-card">
        <div class="sum-card-hdr"><span>📋</span><span class="sum-card-title">Execution Summary</span></div>
        <div class="sum-card-body-np">
            <table class="sum-tbl">
                <thead><tr><th>Summary Item</th><th>Total</th><th>Failed</th></tr></thead>
                <tbody>
                    <tr><td>Iterations</td>       <td class="num-total">${total}</td>     <td class="${failed===0?'num-zero':'num-fail'}">${failed}</td></tr>
                    <tr><td>Requests</td>          <td class="num-total">${totalApis}</td> <td class="${failApis===0?'num-zero':'num-fail'}">${failApis}</td></tr>
                    <tr><td>Prerequest Scripts</td><td class="num-total">0</td>            <td class="num-zero">0</td></tr>
                    <tr><td>Test Scripts</td>      <td class="num-total">${totalApis}</td> <td class="${failApis===0?'num-zero':'num-fail'}">${failApis}</td></tr>
                    <tr><td>Assertions</td>        <td class="num-total">${totalAssert}</td><td class="${failAssert===0?'num-zero':'num-fail'}">${failAssert}</td></tr>
                    <tr><td>Skipped Tests</td>     <td class="num-total">0</td>            <td class="num-zero">—</td></tr>
                </tbody>
            </table>
        </div>
    </div>

    <!-- ATTACHMENTS -->
    <div class="sum-card">
        <div class="sum-card-hdr"><span>📎</span><span class="sum-card-title">Attachments</span></div>
        <div class="sum-card-body">
            <div class="att-row">
                ${dataAttHtml}
                ${evAttHtml}
            </div>
        </div>
    </div>

    <!-- ITERATIONS OVERVIEW -->
    <div class="sum-card">
        <div class="sum-card-hdr">
            <span>🔍</span>
            <span class="sum-card-title">Test Iterations Overview</span>
            <span class="sum-card-note">Click a row to expand API details</span>
        </div>
        <div class="sum-card-body-np">
            <table class="ov-tbl">
                <colgroup>
                    <col class="ov-c1"/>
                    <col class="ov-c2"/>
                    <col class="ov-c3"/>
                    <col class="ov-c4"/>
                    <col class="ov-c5"/>
                    <col class="ov-c6"/>
                </colgroup>
                <thead>
                    <tr>
                        <th class="ov-c1 ov-th-ctr">#</th>
                        <th class="ov-c2">Test Case</th>
                        <th class="ov-c3 ov-th-ctr">Status Code</th>
                        <th class="ov-c4 ov-th-ctr">Result</th>
                        <th class="ov-c5 ov-th-ctr">APIs</th>
                        <th class="ov-c6 ov-th-ctr">Assertions</th>
                    </tr>
                </thead>
                <tbody>${overviewRows}</tbody>
            </table>
        </div>
    </div>

</div>
</div>

<script>
var DL = [${dlPayloads.map(p => '`' + p + '`').join(',')}];
var DN = ${JSON.stringify(dlNames)};
var activeFilter = 'all';
var activeIdx    = -1;

// ── page switch ──────────────────────────────────────────
function switchPage(pg) {
    document.querySelectorAll('.page').forEach(function(p){ p.classList.remove('active'); });
    document.querySelectorAll('.nav-tab').forEach(function(t){ t.classList.remove('active'); });
    document.getElementById('page-'+pg).classList.add('active');
    document.getElementById('ntab-'+pg).classList.add('active');
}

// ── theme ────────────────────────────────────────────────
function toggleTheme() {
    var html=document.documentElement;
    var ico=document.getElementById('theme-ico');
    var lbl=document.getElementById('theme-lbl');
    var dark=html.getAttribute('data-theme')==='dark';
    html.setAttribute('data-theme',dark?'light':'dark');
    ico.textContent=dark?'🌙':'☀️';
    lbl.textContent=dark?'Dark Mode':'Light Mode';
    try { localStorage.setItem('er-theme',dark?'light':'dark'); } catch(e) {}
}
(function(){
    try {
        var s=localStorage.getItem('er-theme');
        if(s==='light'){
            document.documentElement.setAttribute('data-theme','light');
            document.getElementById('theme-ico').textContent='🌙';
            document.getElementById('theme-lbl').textContent='Dark Mode';
        }
    } catch(e) {}
})();

// ── sidebar filter + search ──────────────────────────────
function filterSidebar(filter) {
    activeFilter=filter;
    ['all','pass','fail'].forEach(function(f){
        document.getElementById('tab-'+f).classList.toggle('active',f===filter);
    });
    applySidebarFilters();
}
function searchTests(){ applySidebarFilters(); }
function applySidebarFilters() {
    var q=(document.getElementById('testSearch')?.value||'').toLowerCase().trim();
    var vis=0;
    document.querySelectorAll('.si').forEach(function(item){
        var st=item.getAttribute('data-status');
        var nm=(item.getAttribute('data-name')||'').toLowerCase();
        var show=(activeFilter==='all'||st===activeFilter)&&(q===''||nm.includes(q));
        item.style.display=show?'':'none';
        if(show) vis++;
    });
    var nr=document.getElementById('no-results');
    if(!nr){ nr=document.createElement('div'); nr.id='no-results'; nr.className='no-results'; document.getElementById('sb-list').appendChild(nr); }
    nr.textContent=q?'No matching test cases found':'No test cases match this filter';
    nr.style.display=vis===0?'block':'none';
}

// ── test navigation ──────────────────────────────────────
function showTest(idx) {
    document.getElementById('ph').style.display='none';
    document.querySelectorAll('.tp').forEach(function(p){ p.style.display='none'; });
    document.querySelectorAll('.si').forEach(function(s){ s.classList.remove('active'); });
    document.getElementById('tp-'+idx).style.display='block';
    document.getElementById('si-'+idx).classList.add('active');
    document.getElementById('ct').scrollTop=0;
    activeIdx=idx;
}

// ── api accordion ────────────────────────────────────────
function toggleApi(id) {
    var block=document.getElementById(id);
    var body=block.querySelector('.ab-body');
    var hdr=block.querySelector('.ah');
    var open=body.style.display!=='none';
    body.style.display=open?'none':'block';
    open?hdr.classList.remove('open'):hdr.classList.add('open');
}

// ── tab switching ────────────────────────────────────────
function swTab(btn,tabId,grp) {
    document.querySelectorAll('[data-grp="'+grp+'"]').forEach(function(t){ t.style.display='none'; });
    btn.closest('.tb').querySelectorAll('.tbb').forEach(function(b){ b.classList.remove('active'); });
    document.getElementById(tabId).style.display='block';
    btn.classList.add('active');
}

// ── download ─────────────────────────────────────────────
function dlIter(idx) {
    var blob=new Blob([DL[idx]],{type:'text/plain;charset=utf-8'});
    var url=URL.createObjectURL(blob);
    var a=document.createElement('a'); a.href=url; a.download=DN[idx];
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

// ── copy body ────────────────────────────────────────────
function copyBody(btn) {
    var pre=btn.parentElement.querySelector('pre');
    var text=pre.textContent||pre.innerText||'';
    if(navigator.clipboard&&navigator.clipboard.writeText){
        navigator.clipboard.writeText(text).then(function(){
            btn.textContent='✔ Copied'; btn.classList.add('copied');
            setTimeout(function(){ btn.textContent='⧉ Copy'; btn.classList.remove('copied'); },2000);
        }).catch(function(){ fallbackCopy(btn,text); });
    } else { fallbackCopy(btn,text); }
}
function fallbackCopy(btn,text){
    var ta=document.createElement('textarea'); ta.value=text;
    ta.style.cssText='position:fixed;top:-9999px;left:-9999px;opacity:0;';
    document.body.appendChild(ta); ta.focus(); ta.select();
    try{ document.execCommand('copy'); btn.textContent='✔ Copied'; btn.classList.add('copied');
        setTimeout(function(){ btn.textContent='⧉ Copy'; btn.classList.remove('copied'); },2000); }catch(e){}
    document.body.removeChild(ta);
}

// ── JSON highlighter ─────────────────────────────────────
function highlightJson(raw) {
    var txt=raw.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
    if(!txt.trim()) return raw;
    try { txt=JSON.stringify(JSON.parse(txt),null,2); } catch(e) {}
    return txt.replace(
        /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(?:\s*:)?|\b(?:true|false)\b|\bnull\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?|[{}\[\],:])/g,
        function(m){
            var cls='jp';
            if(/^"/.test(m)){ cls=/:$/.test(m)?'jk':'js'; }
            else if(/^true|false$/.test(m)){ cls='jb'; }
            else if(/^null$/.test(m)){ cls='jnl'; }
            else if(/^-?\d/.test(m)){ cls='jn'; }
            var s=m.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            return '<span class="'+cls+'">'+s+'</span>';
        }
    );
}
(function(){
    document.querySelectorAll('pre.json-body').forEach(function(pre){
        try { pre.innerHTML=highlightJson(pre.textContent||pre.innerText||''); } catch(e) {}
    });
})();

// ── overview row toggle ──────────────────────────────────
function toggleOvRow(idx) {
    var grp=document.getElementById('ovg-'+idx);
    var arr=document.getElementById('ova-'+idx);
    var open=grp.style.display!=='none';
    grp.style.display=open?'none':'table-row';
    arr.classList.toggle('open',!open);
}

// auto-select first sidebar item
(function(){
    var first=document.querySelector('.si');
    if(first) showTest(parseInt(first.id.replace('si-','')));
})();
</script>
</body>
</html>`;

    const out = path.join(reportFolder, 'extent-report.html');
    fs.writeFileSync(out, html, 'utf8');
    console.log(`📊 Extent Report Generated: ${out}`);
}

module.exports = generateExtentReport;