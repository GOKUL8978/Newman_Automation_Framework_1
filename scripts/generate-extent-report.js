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

function generateExtentReport(reportFolder, evidenceData, meta) {

    if (!evidenceData || evidenceData.length === 0) {
        console.log('⚠️  No evidence data for Extent report'); return;
    }

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

    const startStr = meta?.startTime    ? new Date(meta.startTime).toLocaleString()    : new Date().toLocaleString();
    const endStr   = meta?.endTime      ? new Date(meta.endTime).toLocaleString()      : new Date().toLocaleString();
    const durStr   = meta?.totalDuration? `${(meta.totalDuration/1000).toFixed(2)}s`  : '—';
    const colName  = esc(meta?.collectionName || 'Newman Tests');
    const folName  = esc(meta?.folderName     || 'All Tests');

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

    // ── sidebar items (with new layout) ───────────────
    const sidebarItems = evidenceData.map((iter,idx)=>{
        const ok=!iter.apis.some(a=>a.result==='FAILED');
        const cls=ok?'pass':'fail';
        return `
        <div class="si ${cls}" id="si-${idx}" data-status="${cls}" onclick="showTest(${idx})">
            <span class="si-num">${iter.iteration}</span>
            <div class="si-mid">
                <span class="si-name">${esc(iter.testCaseName||'Iteration '+iter.iteration)}</span>
                ${iter.scenarioType ? `<span class="si-scenario ${iter.scenarioType.toLowerCase()==='positive'?'sc-pos':iter.scenarioType.toLowerCase()==='negative'?'sc-neg':'sc-oth'}">${esc(iter.scenarioType)}</span>` : ''}
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

            const mkHdrRows=obj=>obj?Object.entries(obj).map(([k,v])=>`<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join(''):'';
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
                        <div class="copy-wrap">
                            <button class="copy-btn" onclick="copyBody(this)" title="Copy to clipboard">⧉ Copy</button>
                            <pre class="cb json-body">${esc(fmtJson(api.requestBody))}</pre>
                        </div>
                    </div>
                    <div class="tc" id="rsb-${idx}-${ai}" data-grp="${grp}" style="display:none;">
                        <div class="copy-wrap">
                            <button class="copy-btn" onclick="copyBody(this)" title="Copy to clipboard">⧉ Copy</button>
                            <pre class="cb json-body">${esc(fmtJson(api.responseBody))}</pre>
                        </div>
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

    // ── HTML ───────────────────────────────────────────
    const html = `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${colName} — Extent Report</title>
<style>
/* ── variables dark ─────────────────────────────────── */
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
/* ── variables light ────────────────────────────────── */
[data-theme="light"]{
    --bg:#f0f2f5;--bg2:#ffffff;--bg3:#e4e8ed;--bg4:#d8dde4;
    --border:#b0b8c4;--text:#0d1117;--text2:#3d454f;--text3:#5a6472;
    --nav-bg:#1a1f24;--card-bg:#ffffff;--panel-bg:#ffffff;
    --code-bg:#1a1f24;--code-text:#e6edf3;
    --th-bg:#e4e8ed;--td-sep:#d0d7de;--scrollbar:#b0b8c4;
    --tab-active:#0550ae;--sb-bg:#f8f9fb;--sb-hover:#eaecf0;
    --sb-act-p:rgba(22,115,46,.14);--sb-act-f:rgba(180,28,28,.1);
    --btn-bg:#e4e8ed;
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'Segoe UI',system-ui,Arial,sans-serif;background:var(--bg);color:var(--text);font-size:15px;transition:background .2s,color .2s;}

/* ── navbar ─────────────────────────────────────────── */
.nav{background:var(--nav-bg);color:#fff;height:56px;padding:0 18px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:300;box-shadow:0 1px 0 rgba(255,255,255,.08);}
.nav-brand{font-size:16px;font-weight:700;letter-spacing:.3px;white-space:nowrap;}
.nav-brand span{color:#58a6ff;}
.nav-right{display:flex;align-items:center;gap:14px;flex-wrap:wrap;}
.nav-meta{font-size:12px;color:#8b949e;display:flex;gap:14px;flex-wrap:wrap;}
.nav-meta b{color:#cdd9e5;}
.theme-btn{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);border-radius:20px;padding:4px 12px 4px 8px;cursor:pointer;font-size:12px;color:#cdd9e5;display:flex;align-items:center;gap:5px;white-space:nowrap;transition:background .15s;}
.theme-btn:hover{background:rgba(255,255,255,.15);}

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

/* ── layout ─────────────────────────────────────────── */
.layout{display:flex;height:calc(100vh - 56px - 78px - 30px);min-height:440px;}

/* ── sidebar ────────────────────────────────────────── */
.sidebar{width:360px;min-width:260px;background:var(--sb-bg);border-right:1px solid var(--border);flex-shrink:0;display:flex;flex-direction:column;}

/* filter tabs */
.sb-tabs{display:flex;border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--sb-bg);z-index:2;}
.sb-tab{flex:1;padding:9px 4px;font-size:12px;font-weight:600;text-align:center;cursor:pointer;border:none;background:none;color:var(--text2);border-bottom:2px solid transparent;transition:all .15s;}
.sb-tab:hover{background:var(--sb-hover);color:var(--text);}
.sb-tab.active{color:var(--text);border-bottom:2px solid var(--tab-active);}
.sb-tab.tab-pass.active{border-bottom-color:#3fb950;color:#3fb950;}
.sb-tab.tab-fail.active{border-bottom-color:#f85149;color:#f85149;}

/* sidebar count badges inside tabs */
.sb-cnt{display:inline-block;background:var(--bg3);border-radius:8px;padding:1px 6px;font-size:10px;margin-left:4px;font-weight:700;}
.tab-pass .sb-cnt{background:rgba(63,185,80,.15);color:#3fb950;}
.tab-fail .sb-cnt{background:rgba(248,81,73,.15);color:#f85149;}

.sb-list{overflow-y:auto;flex:1;}

/* sidebar item — new layout: num | name | status */
.si{padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border);display:grid;grid-template-columns:32px 1fr auto;align-items:center;gap:10px;transition:background .1s;}
.si:hover{background:var(--sb-hover);}
.si.pass.active{background:var(--sb-act-p);border-left:3px solid #3fb950;}
.si.fail.active{background:var(--sb-act-f);border-left:3px solid #f85149;}

/* iteration number circle */
.si-num{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;flex-shrink:0;}
.si.pass .si-num{background:rgba(63,185,80,.18);color:#3fb950;border:1px solid rgba(63,185,80,.35);}
.si.fail .si-num{background:rgba(248,81,73,.18);color:#f85149;border:1px solid rgba(248,81,73,.35);}

/* test case name */
.si-name{font-size:13px;word-break:break-word;line-height:1.4;color:var(--text);font-weight:500;}
.si-mid{display:flex;flex-direction:column;gap:3px;min-width:0;}
.si-scenario{display:inline-block;font-size:10px;font-weight:700;padding:2px 7px;border-radius:3px;letter-spacing:.3px;text-transform:uppercase;align-self:flex-start;}

/* status pill */
.si-res{font-size:10px;font-weight:700;padding:3px 8px;border-radius:10px;white-space:nowrap;flex-shrink:0;}
.si-res.pass{background:rgba(63,185,80,.15);color:#3fb950;border:1px solid rgba(63,185,80,.3);}
.si-res.fail{background:rgba(248,81,73,.15);color:#f85149;border:1px solid rgba(248,81,73,.3);}

/* ── scenario badge ─────────────────────────────────── */
.sc-badge{font-weight:700;padding:2px 6px;border-radius:3px;letter-spacing:.3px;text-transform:uppercase;display:inline-block;}
.sc-pos{background:rgba(63,185,80,.15);color:#3fb950;border:1px solid rgba(63,185,80,.3);}
.sc-neg{background:rgba(248,81,73,.15);color:#f85149;border:1px solid rgba(248,81,73,.3);}
.sc-oth{background:rgba(139,148,158,.15);color:#8b949e;border:1px solid rgba(139,148,158,.3);}

/* ── content ────────────────────────────────────────── */
.ct{flex:1;overflow-y:auto;padding:14px;background:var(--bg);}
.ph{text-align:center;color:var(--text3);margin-top:80px;font-size:14px;}
.ph-ico{font-size:44px;margin-bottom:10px;}
.no-results{text-align:center;color:var(--text3);padding:24px 0;font-size:12px;font-style:italic;}

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
.mb{font-size:10px;font-weight:700;padding:2px 7px;border-radius:3px;letter-spacing:.4px;flex-shrink:0;text-transform:uppercase;}
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
.tb{display:flex;gap:3px;padding:8px 0 5px;flex-wrap:wrap;border-bottom:1px solid var(--border);}
.tbb{background:none;border:1px solid var(--border);border-radius:4px 4px 0 0;padding:5px 13px;font-size:12px;cursor:pointer;color:var(--text2);transition:all .1s;}
.tbb:hover{background:var(--bg3);}
.tbb.active{background:var(--tab-active);color:#fff;border-color:var(--tab-active);}
.tc{padding-top:8px;}

/* ── assertions ─────────────────────────────────────── */
.atbl{width:100%;border-collapse:collapse;font-size:13px;}
.atbl th{background:var(--th-bg);padding:6px 10px;text-align:left;font-weight:600;color:var(--text2);border-bottom:2px solid var(--border);}
.atbl td{padding:7px 10px;border-bottom:1px solid var(--td-sep);vertical-align:top;color:var(--text);}
.arow-p .ai{color:#3fb950;}.arow-f .ai{color:#f85149;}
.arow-f{background:rgba(248,81,73,.04);}
.a-err{color:#f85149;font-size:12px;font-family:'Courier New',monospace;}
.b-pass{background:rgba(63,185,80,.15);color:#3fb950;padding:2px 8px;border-radius:3px;font-size:11px;font-weight:700;}
.b-fail{background:rgba(248,81,73,.15);color:#f85149;padding:2px 8px;border-radius:3px;font-size:11px;font-weight:700;}
.no-assert{color:var(--text3);font-size:13px;padding:10px 0;font-style:italic;}

/* ── copy wrapper ───────────────────────────────────── */
.copy-wrap{position:relative;}
.copy-btn{position:absolute;top:8px;right:8px;z-index:10;background:var(--bg4);border:1px solid var(--border);border-radius:4px;padding:4px 10px;font-size:11px;cursor:pointer;color:var(--text2);transition:all .15s;opacity:.85;}
.copy-btn:hover{opacity:1;background:var(--tab-active);color:#fff;border-color:var(--tab-active);}
.copy-btn.copied{background:#3fb950;color:#fff;border-color:#3fb950;}

/* ── code + JSON highlighting ───────────────────────── */
.cb{background:var(--code-bg);color:var(--code-text);padding:14px;border-radius:4px;font-size:12px;font-family:'Courier New',Consolas,monospace;overflow-x:auto;white-space:pre-wrap;word-break:break-word;line-height:1.6;max-height:360px;overflow-y:auto;border:1px solid var(--border);}
.jk{color:#79c0ff;}   /* key          — blue   */
.js{color:#a5d6ff;}   /* string value — cyan   */
.jn{color:#f8c94a;}   /* number       — yellow */
.jb{color:#ff7b72;}   /* boolean      — orange */
.jnl{color:#8b949e;}  /* null         — grey   */
.jp{color:#6e7681;}   /* punctuation  — muted  */
[data-theme="light"] .jk{color:#0033a0;}
[data-theme="light"] .js{color:#033a73;}
[data-theme="light"] .jn{color:#7a3000;}
[data-theme="light"] .jb{color:#b91c1c;}
[data-theme="light"] .jnl{color:#4b5563;}
[data-theme="light"] .jp{color:#374151;}

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
</style>
</head>
<body>

<!-- NAVBAR -->
<div class="nav">
    <div class="nav-brand">${folName}&nbsp;<span>Report</span></div>
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

<!-- DASHBOARD -->
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

<!-- META STRIP -->
<div class="ms">
    <span><b>Start:</b> ${startStr}</span>
    <span><b>End:</b> ${endStr}</span>
    <span><b>Duration:</b> ${durStr}</span>
    <span><b>Pass Rate:</b> ${passRate}%</span>
</div>

<!-- LAYOUT -->
<div class="layout">

    <!-- SIDEBAR -->
    <div class="sidebar">
        <!-- filter tabs -->
        <div class="sb-tabs">
            <button class="sb-tab active"    id="tab-all"  onclick="filterSidebar('all')">All<span class="sb-cnt">${total}</span></button>
            <button class="sb-tab tab-pass"  id="tab-pass" onclick="filterSidebar('pass')">Passed<span class="sb-cnt">${passed}</span></button>
            <button class="sb-tab tab-fail"  id="tab-fail" onclick="filterSidebar('fail')">Failed<span class="sb-cnt">${failed}</span></button>
        </div>
        <div class="sb-list" id="sb-list">
            ${sidebarItems}
        </div>
    </div>

    <!-- CONTENT -->
    <div class="ct" id="ct">
        <div class="ph" id="ph">
            <div class="ph-ico">📋</div>
            <div>Select a test case from the left to view details</div>
        </div>
        ${panelsHtml}
    </div>

</div>

<script>
var DL = [${dlPayloads.map(p => '`' + p + '`').join(',')}];
var DN = ${JSON.stringify(dlNames)};
var activeFilter = 'all';
var activeIdx    = -1;

// ── theme ────────────────────────────────────────────────
function toggleTheme() {
    var html=document.documentElement;
    var ico=document.getElementById('theme-ico');
    var lbl=document.getElementById('theme-lbl');
    var dark=html.getAttribute('data-theme')==='dark';
    html.setAttribute('data-theme', dark?'light':'dark');
    ico.textContent=dark?'🌙':'☀️';
    lbl.textContent=dark?'Dark Mode':'Light Mode';
    try { localStorage.setItem('er-theme', dark?'light':'dark'); } catch(e) {}
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

// ── sidebar filter ───────────────────────────────────────
function filterSidebar(filter) {
    activeFilter = filter;
    // update tab button active state
    ['all','pass','fail'].forEach(function(f){
        document.getElementById('tab-'+f).classList.toggle('active', f===filter);
    });
    // show/hide sidebar items
    var items = document.querySelectorAll('.si');
    var visible = 0;
    items.forEach(function(item){
        var show = filter==='all' || item.getAttribute('data-status')===filter;
        item.style.display = show ? '' : 'none';
        if(show) visible++;
    });
    // show empty message if none visible
    var noRes = document.getElementById('no-results');
    if(!noRes){
        noRes = document.createElement('div');
        noRes.id = 'no-results';
        noRes.className = 'no-results';
        noRes.textContent = 'No test cases match this filter';
        document.getElementById('sb-list').appendChild(noRes);
    }
    noRes.style.display = visible===0 ? 'block' : 'none';
}

// ── navigation ───────────────────────────────────────────
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
    var a=document.createElement('a');
    a.href=url; a.download=DN[idx];
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
}

// ── copy body ───────────────────────────────────────────
function copyBody(btn) {
    var pre = btn.parentElement.querySelector('pre');
    var text = pre.textContent || pre.innerText || '';
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function() {
            btn.textContent = '✔ Copied';
            btn.classList.add('copied');
            setTimeout(function() {
                btn.textContent = '⧉ Copy';
                btn.classList.remove('copied');
            }, 2000);
        }).catch(function() { fallbackCopy(btn, text); });
    } else {
        fallbackCopy(btn, text);
    }
}
function fallbackCopy(btn, text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;';
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    try {
        document.execCommand('copy');
        btn.textContent = '✔ Copied';
        btn.classList.add('copied');
        setTimeout(function() {
            btn.textContent = '⧉ Copy';
            btn.classList.remove('copied');
        }, 2000);
    } catch(e) {}
    document.body.removeChild(ta);
}

// ── JSON syntax highlighter ──────────────────────────────
function highlightJson(raw) {
    var txt=raw
        .replace(/&amp;/g,'&').replace(/&lt;/g,'<')
        .replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
    if(!txt.trim()) return raw;
    try { txt=JSON.stringify(JSON.parse(txt),null,2); } catch(e) {}
    return txt.replace(
        /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(?:\s*:)?|\b(?:true|false)\b|\bnull\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?|[{}\[\],:])/g,
        function(m) {
            var cls='jp';
            if(/^"/.test(m))      { cls=/:$/.test(m)?'jk':'js'; }
            else if(/^true|false$/.test(m)) { cls='jb';  }
            else if(/^null$/.test(m))       { cls='jnl'; }
            else if(/^-?\d/.test(m))        { cls='jn';  }
            var s=m.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            return '<span class="'+cls+'">'+s+'</span>';
        }
    );
}
(function(){
    document.querySelectorAll('pre.json-body').forEach(function(pre){
        try {
            pre.innerHTML=highlightJson(pre.textContent||pre.innerText||'');
        } catch(e) {}
    });
})();

// auto-select first visible item
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