// ======================================================
// scripts/generate-extent-report.js
//
// Generates a fully self-contained Extent-style HTML
// report. Zero external dependencies.
//
// Features:
//   • Dark / Light mode toggle (persisted in localStorage)
//   • Dashboard: total/pass/fail counts + animated donut
//   • Sidebar: test case name (from data file column) +
//     scenario type badge (Positive / Negative / custom)
//   • Detail panel per iteration:
//       - Header: status badge, test name, scenario type,
//         iteration number, API count, Download button
//       - Per-API accordion: Method, URL, status code,
//         response time, result badge
//       - Tabs per API: Assertions | Request Body |
//         Response Body | Headers
//   • Download button — exports full iteration detail
//     as a plain-text .txt file (Blob download, no server)
//   • No evidence/ folder or .txt files on disk
// ======================================================

const fs   = require('fs');
const path = require('path');

// ── helpers ────────────────────────────────────────────

function esc(str) {
    return String(str || '')
        .replace(/&/g,  '&amp;')
        .replace(/</g,  '&lt;')
        .replace(/>/g,  '&gt;')
        .replace(/"/g,  '&quot;')
        .replace(/'/g,  '&#39;');
}

function escJs(str) {
    return String(str || '')
        .replace(/\\/g, '\\\\')
        .replace(/`/g,  '\\`')
        .replace(/\$/g, '\\$');
}

function fmtJson(str) {
    try   { return JSON.stringify(JSON.parse(str), null, 2); }
    catch { return String(str || ''); }
}

// ======================================================
// MAIN EXPORT
// ======================================================

/**
 * @param {string} reportFolder
 * @param {Array}  evidenceData  — see shape below
 * @param {object} meta          — see shape below
 *
 * evidenceData item:
 * {
 *   iteration:    number,
 *   testCaseName: string,   — from testCaseNameColumn in data file
 *   scenarioType: string,   — from testScenarioTypeColumn in data file
 *   apis: [{
 *     apiName:         string,
 *     method:          string,
 *     url:             string,
 *     statusCode:      number,
 *     requestBody:     string,
 *     responseBody:    string,
 *     requestHeaders:  object,
 *     responseHeaders: object,
 *     responseTime:    number,
 *     result:          'PASSED'|'FAILED',
 *     assertions: [{ name:string, passed:boolean, error:string|null }]
 *   }]
 * }
 *
 * meta:
 * {
 *   collectionName: string,
 *   folderName:     string,
 *   startTime:      Date,
 *   endTime:        Date,
 *   totalDuration:  number (ms)
 * }
 */
function generateExtentReport(reportFolder, evidenceData, meta) {

    if (!evidenceData || evidenceData.length === 0) {
        console.log('⚠️  No evidence data for Extent report');
        return;
    }

    // ── summary counts ─────────────────────────────────

    const total  = evidenceData.length;
    const passed = evidenceData.filter(d => !d.apis.some(a => a.result === 'FAILED')).length;
    const failed = total - passed;

    let totalApis = 0, passApis = 0, failApis = 0;
    let totalAssert = 0, passAssert = 0, failAssert = 0;

    evidenceData.forEach(iter => {
        iter.apis.forEach(api => {
            totalApis++;
            api.result === 'PASSED' ? passApis++ : failApis++;
            (api.assertions || []).forEach(a => {
                totalAssert++;
                a.passed ? passAssert++ : failAssert++;
            });
        });
    });

    const passRate  = total > 0 ? Math.round((passed / total) * 100) : 0;
    const donutPass = total > 0 ? Math.round((passed / total) * 251.2) : 0;
    const donutFail = 251.2 - donutPass;

    const startStr = meta?.startTime  ? new Date(meta.startTime).toLocaleString() : new Date().toLocaleString();
    const endStr   = meta?.endTime    ? new Date(meta.endTime).toLocaleString()   : new Date().toLocaleString();
    const durStr   = meta?.totalDuration ? `${(meta.totalDuration / 1000).toFixed(2)}s` : '—';
    const colName  = esc(meta?.collectionName || 'Newman Tests');
    const folName  = esc(meta?.folderName     || 'All Tests');

    // ── scenario badge ─────────────────────────────────

    function scenarioBadge(type, size) {
        if (!type || !type.trim()) return '';
        const t   = type.trim();
        const cls = t.toLowerCase() === 'positive' ? 'sc-pos'
                  : t.toLowerCase() === 'negative' ? 'sc-neg'
                  : 'sc-oth';
        const fs  = size === 'sm' ? 'font-size:9px;' : 'font-size:10px;';
        return `<span class="sc-badge ${cls}" style="${fs}">${esc(t)}</span>`;
    }

    // ── download payload per iteration ─────────────────
    // Embedded as JS template literals inside the HTML.
    // The Download button creates a Blob from this string
    // and triggers a browser download — no server needed.

    const dlPayloads = evidenceData.map(iter => {
        const ok   = !iter.apis.some(a => a.result === 'FAILED');
        const LINE = '='.repeat(80);
        const DASH = '-'.repeat(60);
        let t = '';
        t += `${LINE}\n`;
        t += `TEST CASE NAME : ${iter.testCaseName || 'Iteration ' + iter.iteration}\n`;
        t += `ITERATION      : ${iter.iteration}\n`;
        if (iter.scenarioType) t += `SCENARIO TYPE  : ${iter.scenarioType}\n`;
        t += `OVERALL RESULT : ${ok ? 'PASSED' : 'FAILED'}\n`;
        t += `${LINE}\n\n`;
        iter.apis.forEach((api, i) => {
            t += `${DASH}\n`;
            t += `API #${i + 1} : ${api.apiName || 'Unknown'}\n`;
            t += `${DASH}\n`;
            t += `Method        : ${api.method      || ''}\n`;
            t += `URL           : ${api.url          || ''}\n`;
            t += `Status Code   : ${api.statusCode   || ''}\n`;
            t += `Response Time : ${api.responseTime || 0}ms\n`;
            t += `Result        : ${api.result       || ''}\n\n`;
            t += `ASSERTIONS\n`;
            if (api.assertions && api.assertions.length) {
                api.assertions.forEach(a => {
                    t += `  [${a.passed ? 'PASS' : 'FAIL'}] ${a.name}`;
                    if (!a.passed && a.error) t += `  →  ${a.error}`;
                    t += '\n';
                });
            } else {
                t += '  (none)\n';
            }
            t += `\nREQUEST BODY\n${fmtJson(api.requestBody) || '(empty)'}\n\n`;
            t += `RESPONSE BODY\n${fmtJson(api.responseBody) || '(empty)'}\n\n`;
        });
        t += `${LINE}\n`;
        return escJs(t);
    });

    const dlNames = evidenceData.map((d, i) => {
        const safe = (d.testCaseName || 'Iteration_' + i)
            .replace(/[^a-zA-Z0-9_\- ]/g, '_')
            .replace(/\s+/g, '_')
            .substring(0, 50);
        return `Iter_${i}_${safe}.txt`;
    });

    // ── sidebar ────────────────────────────────────────

    const sidebarHtml = evidenceData.map((iter, idx) => {
        const ok  = !iter.apis.some(a => a.result === 'FAILED');
        const cls = ok ? 'pass' : 'fail';
        const ico = ok ? '✔' : '✖';
        return `
        <div class="si ${cls}" id="si-${idx}" onclick="showTest(${idx})">
            <span class="si-ico">${ico}</span>
            <div class="si-body">
                <span class="si-name">${esc(iter.testCaseName || 'Iteration ' + iter.iteration)}</span>
                <div class="si-row2">
                    <span class="si-iter">Iter&nbsp;${iter.iteration}</span>
                    ${scenarioBadge(iter.scenarioType, 'sm')}
                </div>
            </div>
        </div>`;
    }).join('');

    // ── test panels ────────────────────────────────────

    const panelsHtml = evidenceData.map((iter, idx) => {
        const ok    = !iter.apis.some(a => a.result === 'FAILED');
        const cls   = ok ? 'pass' : 'fail';
        const label = ok ? 'PASSED' : 'FAILED';

        // per-API accordion blocks
        const apiHtml = iter.apis.map((api, ai) => {
            const aok  = api.result === 'PASSED';
            const acls = aok ? 'pass' : 'fail';
            const mcls = (api.method || 'GET').toLowerCase();
            const grp  = `g-${idx}-${ai}`;

            // assertions table
            const assertRows = (api.assertions || []).map(a => `
                <tr class="${a.passed ? 'arow-p' : 'arow-f'}">
                    <td class="ai">${a.passed ? '✔' : '✖'}</td>
                    <td>${esc(a.name)}</td>
                    <td>${a.passed
                        ? '<span class="b-pass">PASSED</span>'
                        : '<span class="b-fail">FAILED</span>'}</td>
                    <td class="a-err">${esc(a.error || '')}</td>
                </tr>`).join('');

            const assertTbl = (api.assertions && api.assertions.length)
                ? `<table class="atbl">
                     <thead><tr><th></th><th>Assertion</th><th>Result</th><th>Error</th></tr></thead>
                     <tbody>${assertRows}</tbody>
                   </table>`
                : `<p class="no-assert">No assertions defined for this request.</p>`;

            // header tables
            const mkHdrRows = obj => obj
                ? Object.entries(obj).map(([k,v]) =>
                    `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')
                : '';
            const rqHdr = mkHdrRows(api.requestHeaders);
            const rsHdr = mkHdrRows(api.responseHeaders);
            const hdrTab = (rqHdr || rsHdr) ? `
                <div class="hdr-row">
                    ${rqHdr ? `<div class="hdr-blk">
                        <div class="hdr-lbl">Request Headers</div>
                        <table class="hdrt"><thead><tr><th>Key</th><th>Value</th></tr></thead>
                        <tbody>${rqHdr}</tbody></table></div>` : ''}
                    ${rsHdr ? `<div class="hdr-blk">
                        <div class="hdr-lbl">Response Headers</div>
                        <table class="hdrt"><thead><tr><th>Key</th><th>Value</th></tr></thead>
                        <tbody>${rsHdr}</tbody></table></div>` : ''}
                </div>` : '';

            return `
            <div class="ab ${acls}" id="ab-${idx}-${ai}">
                <div class="ah" onclick="toggleApi('ab-${idx}-${ai}')">
                    <span class="mb ${mcls}">${esc(api.method || 'GET')}</span>
                    <span class="a-name">${esc(api.apiName || 'Unknown')}</span>
                    <span class="a-url">${esc(api.url || '')}</span>
                    <div class="a-meta">
                        <span class="sc ${aok ? 'sc-ok' : 'sc-err'}">${esc(String(api.statusCode || ''))}</span>
                        ${api.responseTime ? `<span class="rt">${api.responseTime}ms</span>` : ''}
                        <span class="a-res ${acls}">${api.result || 'UNKNOWN'}</span>
                        <span class="arrow">▼</span>
                    </div>
                </div>
                <div class="ab-body" style="display:none;">
                    <div class="tb">
                        <button class="tbb active" onclick="swTab(this,'asc-${idx}-${ai}','${grp}')">Assertions</button>
                        <button class="tbb"        onclick="swTab(this,'rqb-${idx}-${ai}','${grp}')">Request Body</button>
                        <button class="tbb"        onclick="swTab(this,'rsb-${idx}-${ai}','${grp}')">Response Body</button>
                        ${(rqHdr || rsHdr) ? `<button class="tbb" onclick="swTab(this,'hdr-${idx}-${ai}','${grp}')">Headers</button>` : ''}
                    </div>
                    <div class="tc" id="asc-${idx}-${ai}" data-grp="${grp}">${assertTbl}</div>
                    <div class="tc" id="rqb-${idx}-${ai}" data-grp="${grp}" style="display:none;"><pre class="cb">${esc(fmtJson(api.requestBody))}</pre></div>
                    <div class="tc" id="rsb-${idx}-${ai}" data-grp="${grp}" style="display:none;"><pre class="cb">${esc(fmtJson(api.responseBody))}</pre></div>
                    ${(rqHdr || rsHdr) ? `<div class="tc" id="hdr-${idx}-${ai}" data-grp="${grp}" style="display:none;">${hdrTab}</div>` : ''}
                </div>
            </div>`;
        }).join('');

        return `
        <div class="tp" id="tp-${idx}" style="display:none;">
            <div class="tph ${cls}">
                <div class="tph-left">
                    <span class="tsb ${cls}">${label}</span>
                    <span class="t-name">${esc(iter.testCaseName || 'Iteration ' + iter.iteration)}</span>
                    ${scenarioBadge(iter.scenarioType, 'md')}
                </div>
                <div class="tph-right">
                    <span class="t-meta">Iteration: ${iter.iteration}</span>
                    <span class="t-meta">${iter.apis.length} API${iter.apis.length !== 1 ? 's' : ''}</span>
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
/* ── CSS variables ──────────────────────────────────── */
:root {
    --bg:         #0d1117;
    --bg2:        #161b22;
    --bg3:        #1c2128;
    --bg4:        #21262d;
    --border:     #30363d;
    --text:       #e6edf3;
    --text2:      #8b949e;
    --text3:      #6e7681;
    --nav-bg:     #010409;
    --card-bg:    #21262d;
    --panel-bg:   #161b22;
    --code-bg:    #010409;
    --code-text:  #e6edf3;
    --th-bg:      #1c2128;
    --td-sep:     #21262d;
    --scrollbar:  #30363d;
    --tab-active: #58a6ff;
    --sb-bg:      #161b22;
    --sb-hover:   #1c2128;
    --sb-act-p:   rgba(63,185,80,.15);
    --sb-act-f:   rgba(248,81,73,.15);
    --btn-bg:     #21262d;
}
[data-theme="light"] {
    --bg:         #f6f8fa;
    --bg2:        #ffffff;
    --bg3:        #f0f2f5;
    --bg4:        #e8ecef;
    --border:     #d0d7de;
    --text:       #1f2328;
    --text2:      #656d76;
    --text3:      #8c959f;
    --nav-bg:     #24292f;
    --card-bg:    #f6f8fa;
    --panel-bg:   #ffffff;
    --code-bg:    #1f2328;
    --code-text:  #e6edf3;
    --th-bg:      #f0f2f5;
    --td-sep:     #eaeef2;
    --scrollbar:  #d0d7de;
    --tab-active: #0969da;
    --sb-bg:      #ffffff;
    --sb-hover:   #f6f8fa;
    --sb-act-p:   rgba(31,136,61,.12);
    --sb-act-f:   rgba(207,34,46,.1);
    --btn-bg:     #f0f2f5;
}

/* ── reset ──────────────────────────────────────────── */
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'Segoe UI',system-ui,Arial,sans-serif;background:var(--bg);color:var(--text);font-size:13px;transition:background .2s,color .2s;}

/* ── navbar ─────────────────────────────────────────── */
.nav{background:var(--nav-bg);color:#fff;height:52px;padding:0 18px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:300;box-shadow:0 1px 0 rgba(255,255,255,.08);}
.nav-brand{font-size:16px;font-weight:700;letter-spacing:.3px;white-space:nowrap;}
.nav-brand span{color:#58a6ff;}
.nav-right{display:flex;align-items:center;gap:14px;flex-wrap:wrap;}
.nav-meta{font-size:11px;color:#8b949e;display:flex;gap:14px;flex-wrap:wrap;}
.nav-meta b{color:#cdd9e5;}

/* ── theme toggle ───────────────────────────────────── */
.theme-btn{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);border-radius:20px;padding:4px 12px 4px 8px;cursor:pointer;font-size:11px;color:#cdd9e5;display:flex;align-items:center;gap:5px;white-space:nowrap;transition:background .15s;}
.theme-btn:hover{background:rgba(255,255,255,.15);}

/* ── dashboard ──────────────────────────────────────── */
.dash{background:var(--bg);padding:14px 18px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;border-bottom:1px solid var(--border);}
.dc{background:var(--card-bg);border:1px solid var(--border);border-radius:8px;padding:11px 16px;min-width:100px;text-align:center;}
.dc-n{font-size:24px;font-weight:700;line-height:1;}
.dc-l{font-size:10px;color:var(--text2);margin-top:3px;text-transform:uppercase;letter-spacing:.4px;}
.dc.tot .dc-n{color:#58a6ff;}
.dc.pas .dc-n{color:#3fb950;}
.dc.fai .dc-n{color:#f85149;}
.donut-wrap{margin-left:auto;display:flex;align-items:center;gap:12px;}
.donut-wrap svg{transform:rotate(-90deg);}
.di .rate{font-size:19px;font-weight:700;color:var(--text);}
.di .pl{color:#3fb950;font-size:11px;font-weight:600;}
.di .fl{color:#f85149;font-size:11px;font-weight:600;}

/* ── meta strip ─────────────────────────────────────── */
.ms{background:var(--bg2);border-bottom:1px solid var(--border);padding:6px 18px;display:flex;gap:22px;font-size:11px;color:var(--text2);flex-wrap:wrap;}
.ms b{color:var(--text);}

/* ── layout ─────────────────────────────────────────── */
.layout{display:flex;height:calc(100vh - 52px - 74px - 28px);min-height:460px;}

/* ── sidebar ────────────────────────────────────────── */
.sidebar{width:268px;min-width:190px;background:var(--sb-bg);border-right:1px solid var(--border);overflow-y:auto;flex-shrink:0;display:flex;flex-direction:column;}
.sb-hdr{padding:9px 13px 7px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--text3);border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--sb-bg);z-index:1;}
.si{padding:9px 13px;cursor:pointer;border-bottom:1px solid var(--border);display:flex;align-items:flex-start;gap:7px;transition:background .1s;}
.si:hover{background:var(--sb-hover);}
.si.pass.active{background:var(--sb-act-p);border-left:3px solid #3fb950;}
.si.fail.active{background:var(--sb-act-f);border-left:3px solid #f85149;}
.si-ico{font-size:11px;margin-top:2px;flex-shrink:0;}
.si.pass .si-ico{color:#3fb950;}
.si.fail .si-ico{color:#f85149;}
.si-body{flex:1;min-width:0;}
.si-name{font-size:12px;word-break:break-word;line-height:1.3;display:block;color:var(--text);}
.si-row2{display:flex;align-items:center;gap:5px;margin-top:3px;flex-wrap:wrap;}
.si-iter{font-size:10px;color:var(--text3);}

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
.t-name{font-size:14px;font-weight:600;color:var(--text);}
.tsb{padding:2px 9px;border-radius:3px;font-size:10px;font-weight:700;letter-spacing:.4px;}
.tsb.pass{background:#3fb950;color:#fff;}
.tsb.fail{background:#f85149;color:#fff;}
.t-meta{font-size:11px;color:var(--text2);}

/* ── download button ────────────────────────────────── */
.dl-btn{background:var(--btn-bg);border:1px solid var(--border);border-radius:5px;padding:4px 10px;font-size:11px;cursor:pointer;color:var(--text);transition:all .12s;white-space:nowrap;}
.dl-btn:hover{background:var(--bg4);}

/* ── api list ───────────────────────────────────────── */
.api-list{background:var(--panel-bg);}
.ab{border-bottom:1px solid var(--border);}
.ab:last-child{border-bottom:none;}
.ab.pass .ah{border-left:3px solid #3fb950;}
.ab.fail .ah{border-left:3px solid #f85149;}
.ah{padding:9px 14px;display:flex;align-items:center;gap:8px;cursor:pointer;transition:background .1s;flex-wrap:wrap;}
.ah:hover{background:var(--bg3);}
.ah.open .arrow{transform:rotate(180deg);}

/* ── method badge ───────────────────────────────────── */
.mb{font-size:9px;font-weight:700;padding:2px 6px;border-radius:3px;letter-spacing:.4px;flex-shrink:0;text-transform:uppercase;}
.mb.get   {background:rgba(88,166,255,.15);color:#58a6ff;}
.mb.post  {background:rgba(63,185,80,.15);color:#3fb950;}
.mb.put   {background:rgba(255,166,77,.15);color:#ffa64d;}
.mb.patch {background:rgba(188,140,255,.15);color:#bc8cff;}
.mb.delete{background:rgba(248,81,73,.15);color:#f85149;}

.a-name{font-weight:600;font-size:13px;color:var(--text);}
.a-url{font-size:10px;color:var(--text2);flex:1;word-break:break-all;}
.a-meta{display:flex;align-items:center;gap:7px;margin-left:auto;flex-shrink:0;}
.sc{font-size:10px;font-weight:700;padding:2px 6px;border-radius:3px;}
.sc-ok {background:rgba(63,185,80,.15);color:#3fb950;}
.sc-err{background:rgba(248,81,73,.15);color:#f85149;}
.rt{font-size:10px;color:var(--text3);}
.a-res{font-size:9px;font-weight:700;padding:2px 7px;border-radius:3px;}
.a-res.pass{background:#3fb950;color:#fff;}
.a-res.fail{background:#f85149;color:#fff;}
.arrow{color:var(--text3);font-size:9px;transition:transform .18s;}

/* ── api body ───────────────────────────────────────── */
.ab-body{padding:0 14px 12px;border-top:1px solid var(--border);}
.tb{display:flex;gap:3px;padding:8px 0 5px;flex-wrap:wrap;border-bottom:1px solid var(--border);}
.tbb{background:none;border:1px solid var(--border);border-radius:4px 4px 0 0;padding:4px 11px;font-size:11px;cursor:pointer;color:var(--text2);transition:all .1s;}
.tbb:hover{background:var(--bg3);}
.tbb.active{background:var(--tab-active);color:#fff;border-color:var(--tab-active);}
.tc{padding-top:8px;}

/* ── assertions ─────────────────────────────────────── */
.atbl{width:100%;border-collapse:collapse;font-size:12px;}
.atbl th{background:var(--th-bg);padding:5px 9px;text-align:left;font-weight:600;color:var(--text2);border-bottom:2px solid var(--border);}
.atbl td{padding:6px 9px;border-bottom:1px solid var(--td-sep);vertical-align:top;color:var(--text);}
.arow-p .ai{color:#3fb950;}
.arow-f .ai{color:#f85149;}
.arow-f{background:rgba(248,81,73,.04);}
.a-err{color:#f85149;font-size:11px;font-family:'Courier New',monospace;}
.b-pass{background:rgba(63,185,80,.15);color:#3fb950;padding:1px 7px;border-radius:3px;font-size:10px;font-weight:700;}
.b-fail{background:rgba(248,81,73,.15);color:#f85149;padding:1px 7px;border-radius:3px;font-size:10px;font-weight:700;}
.no-assert{color:var(--text3);font-size:12px;padding:10px 0;font-style:italic;}

/* ── code block ─────────────────────────────────────── */
.cb{background:var(--code-bg);color:var(--code-text);padding:12px;border-radius:4px;font-size:11px;font-family:'Courier New',Consolas,monospace;overflow-x:auto;white-space:pre-wrap;word-break:break-word;line-height:1.5;max-height:360px;overflow-y:auto;border:1px solid var(--border);}

/* ── headers ────────────────────────────────────────── */
.hdr-row{display:flex;gap:12px;flex-wrap:wrap;}
.hdr-blk{flex:1;min-width:240px;}
.hdr-lbl{font-size:10px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.4px;margin-bottom:5px;}
.hdrt{width:100%;border-collapse:collapse;font-size:11px;table-layout:fixed;}
.hdrt th{background:var(--th-bg);padding:4px 9px;text-align:left;font-weight:600;border-bottom:1px solid var(--border);color:var(--text2);}
.hdrt th:first-child{width:38%;}
.hdrt th:last-child{width:62%;}
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
    <div class="nav-brand">⚡ <span>Extent</span>&nbsp;Report</div>
    <div class="nav-right">
        <div class="nav-meta">
            <span><b>Collection:</b> ${colName}</span>
            <span><b>Folder:</b> ${folName}</span>
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
        <div class="sb-hdr">Test Cases (${total})</div>
        ${sidebarHtml}
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
// ── download data ───────────────────────────────────────
var DL = [${dlPayloads.map(p => '`' + p + '`').join(',')}];
var DN = ${JSON.stringify(dlNames)};

// ── theme ───────────────────────────────────────────────
function toggleTheme() {
    var html = document.documentElement;
    var ico  = document.getElementById('theme-ico');
    var lbl  = document.getElementById('theme-lbl');
    var isDark = html.getAttribute('data-theme') === 'dark';
    html.setAttribute('data-theme', isDark ? 'light' : 'dark');
    ico.textContent = isDark ? '🌙' : '☀️';
    lbl.textContent = isDark ? 'Dark Mode' : 'Light Mode';
    try { localStorage.setItem('er-theme', isDark ? 'light' : 'dark'); } catch(e) {}
}
(function() {
    try {
        var s = localStorage.getItem('er-theme');
        if (s === 'light') {
            document.documentElement.setAttribute('data-theme', 'light');
            document.getElementById('theme-ico').textContent = '🌙';
            document.getElementById('theme-lbl').textContent = 'Dark Mode';
        }
    } catch(e) {}
})();

// ── sidebar navigation ──────────────────────────────────
function showTest(idx) {
    document.getElementById('ph').style.display = 'none';
    document.querySelectorAll('.tp').forEach(function(p) { p.style.display = 'none'; });
    document.querySelectorAll('.si').forEach(function(s) { s.classList.remove('active'); });
    document.getElementById('tp-' + idx).style.display = 'block';
    document.getElementById('si-' + idx).classList.add('active');
    document.getElementById('ct').scrollTop = 0;
}

// ── api accordion ───────────────────────────────────────
function toggleApi(id) {
    var block  = document.getElementById(id);
    var body   = block.querySelector('.ab-body');
    var header = block.querySelector('.ah');
    var isOpen = body.style.display !== 'none';
    body.style.display = isOpen ? 'none' : 'block';
    if (isOpen) { header.classList.remove('open'); }
    else        { header.classList.add('open');    }
}

// ── tab switching ───────────────────────────────────────
function swTab(btn, tabId, grp) {
    document.querySelectorAll('[data-grp="' + grp + '"]').forEach(function(t) {
        t.style.display = 'none';
    });
    btn.closest('.tb').querySelectorAll('.tbb').forEach(function(b) {
        b.classList.remove('active');
    });
    document.getElementById(tabId).style.display = 'block';
    btn.classList.add('active');
}

// ── download iteration ──────────────────────────────────
function dlIter(idx) {
    var blob = new Blob([DL[idx]], { type: 'text/plain;charset=utf-8' });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href = url;
    a.download = DN[idx];
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// auto-select first item
if (document.querySelector('.si')) { showTest(0); }
</script>
</body>
</html>`;

    // ── write ──────────────────────────────────────────
    const out = path.join(reportFolder, 'extent-report.html');
    fs.writeFileSync(out, html, 'utf8');
    console.log(`📊 Extent Report Generated: ${out}`);
}

module.exports = generateExtentReport;
