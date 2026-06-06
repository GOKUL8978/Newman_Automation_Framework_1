// ======================================================
// scripts/generate-extent-report.js
//
// Generates an Extent Reports-style HTML report.
//
// Layout:
//   • Top navbar with project name and run timestamp
//   • Dashboard: total / passed / failed / skipped cards
//     + donut chart (pass vs fail)
//   • Iteration-level timeline on the left sidebar
//   • Test detail panel: each iteration expands to show
//     every API with request, response, assertions
//   • Fully self-contained single HTML file — no CDN
// ======================================================

const fs   = require('fs');
const path = require('path');

// ======================================================
// HELPERS
// ======================================================

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatJson(str) {
    try {
        return JSON.stringify(JSON.parse(str), null, 2);
    } catch {
        return str;
    }
}

// ======================================================
// MAIN EXPORT
// ======================================================

/**
 * @param {string} reportFolder
 * @param {Array}  evidenceData
 * @param {object} meta
 *   {
 *     collectionName: string,
 *     folderName:     string,
 *     startTime:      Date,
 *     endTime:        Date,
 *     totalDuration:  number  (ms)
 *   }
 *
 * evidenceData shape:
 * [
 *   {
 *     iteration:    number,
 *     testCaseName: string,
 *     apis: [
 *       {
 *         apiName:      string,
 *         method:       string,
 *         url:          string,
 *         statusCode:   number,
 *         requestBody:  string,
 *         responseBody: string,
 *         requestHeaders:  object,
 *         responseHeaders: object,
 *         responseTime: number,   (ms)
 *         result:       'PASSED'|'FAILED',
 *         assertions: [
 *           { name: string, passed: boolean, error: string|null }
 *         ]
 *       }
 *     ]
 *   }
 * ]
 */
function generateExtentReport(
    reportFolder,
    evidenceData,
    meta
) {

    if (!evidenceData || evidenceData.length === 0) {
        console.log('⚠️  No evidence data for Extent report');
        return;
    }

    // ── summary counts ──────────────────────────────────

    const totalIterations  = evidenceData.length;
    const passedIterations = evidenceData.filter(
        d => !d.apis.some(a => a.result === 'FAILED')
    ).length;
    const failedIterations = totalIterations - passedIterations;

    let totalApis  = 0;
    let passedApis = 0;
    let failedApis = 0;
    let totalAssertions  = 0;
    let passedAssertions = 0;
    let failedAssertions = 0;

    evidenceData.forEach(iter => {
        iter.apis.forEach(api => {
            totalApis++;
            if (api.result === 'PASSED') passedApis++;
            else failedApis++;
            (api.assertions || []).forEach(a => {
                totalAssertions++;
                if (a.passed) passedAssertions++;
                else failedAssertions++;
            });
        });
    });

    const passRate = totalIterations > 0
        ? Math.round((passedIterations / totalIterations) * 100)
        : 0;

    const startTime = meta?.startTime
        ? new Date(meta.startTime).toLocaleString()
        : new Date().toLocaleString();

    const endTime = meta?.endTime
        ? new Date(meta.endTime).toLocaleString()
        : new Date().toLocaleString();

    const duration = meta?.totalDuration
        ? `${(meta.totalDuration / 1000).toFixed(2)}s`
        : '—';

    const collectionName = meta?.collectionName || 'Newman Tests';
    const folderName     = meta?.folderName     || 'All Tests';

    // ── donut chart values ──────────────────────────────

    const donutPass   = totalIterations > 0
        ? Math.round((passedIterations / totalIterations) * 251.2)
        : 0;
    const donutFail   = 251.2 - donutPass;

    // ── sidebar items ───────────────────────────────────

    const sidebarItems = evidenceData.map((iter, idx) => {

        const iterPassed = !iter.apis.some(a => a.result === 'FAILED');
        const statusClass = iterPassed ? 'pass' : 'fail';
        const statusIcon  = iterPassed ? '✔' : '✖';

        return `
        <div class="sidebar-item ${statusClass}" onclick="showTest(${idx})" id="sidebar-${idx}">
            <span class="sidebar-icon">${statusIcon}</span>
            <span class="sidebar-name">${escapeHtml(iter.testCaseName || `Iteration ${iter.iteration}`)}</span>
            <span class="sidebar-iter">Iter ${iter.iteration}</span>
        </div>`;
    }).join('');

    // ── test detail panels ──────────────────────────────

    const testPanels = evidenceData.map((iter, idx) => {

        const iterPassed  = !iter.apis.some(a => a.result === 'FAILED');
        const statusClass = iterPassed ? 'pass' : 'fail';
        const statusLabel = iterPassed ? 'PASSED' : 'FAILED';

        const apiBlocks = iter.apis.map((api, apiIdx) => {

            const apiPassed    = api.result === 'PASSED';
            const apiClass     = apiPassed ? 'pass' : 'fail';
            const methodClass  = (api.method || 'GET').toLowerCase();

            const assertionRows = (api.assertions || []).map(a => `
                <tr class="${a.passed ? 'assert-pass' : 'assert-fail'}">
                    <td><span class="assert-icon">${a.passed ? '✔' : '✖'}</span></td>
                    <td>${escapeHtml(a.name)}</td>
                    <td>${a.passed ? '<span class="badge-pass">PASSED</span>' : '<span class="badge-fail">FAILED</span>'}</td>
                    <td class="assert-error">${escapeHtml(a.error || '')}</td>
                </tr>`).join('');

            const assertionTable = (api.assertions && api.assertions.length > 0)
                ? `<table class="assert-table">
                    <thead><tr><th></th><th>Assertion</th><th>Result</th><th>Error</th></tr></thead>
                    <tbody>${assertionRows}</tbody>
                   </table>`
                : `<p class="no-assertions">No assertions defined for this request.</p>`;

            const reqHeaders = api.requestHeaders
                ? Object.entries(api.requestHeaders)
                    .map(([k,v]) => `<tr><td>${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`)
                    .join('')
                : '';

            const resHeaders = api.responseHeaders
                ? Object.entries(api.responseHeaders)
                    .map(([k,v]) => `<tr><td>${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`)
                    .join('')
                : '';

            const headerTables = (reqHeaders || resHeaders) ? `
                <div class="headers-row">
                    ${reqHeaders ? `
                    <div class="header-block">
                        <div class="block-label">Request Headers</div>
                        <table class="header-table">
                            <thead><tr><th>Key</th><th>Value</th></tr></thead>
                            <tbody>${reqHeaders}</tbody>
                        </table>
                    </div>` : ''}
                    ${resHeaders ? `
                    <div class="header-block">
                        <div class="block-label">Response Headers</div>
                        <table class="header-table">
                            <thead><tr><th>Key</th><th>Value</th></tr></thead>
                            <tbody>${resHeaders}</tbody>
                        </table>
                    </div>` : ''}
                </div>` : '';

            return `
            <div class="api-block ${apiClass}" id="api-${idx}-${apiIdx}">
                <div class="api-header" onclick="toggleApi('api-${idx}-${apiIdx}')">
                    <span class="method-badge ${methodClass}">${escapeHtml(api.method || 'GET')}</span>
                    <span class="api-name">${escapeHtml(api.apiName || 'Unknown')}</span>
                    <span class="api-url">${escapeHtml(api.url || '')}</span>
                    <div class="api-meta">
                        <span class="status-code ${apiPassed ? 'code-ok' : 'code-err'}">${escapeHtml(String(api.statusCode || ''))}</span>
                        ${api.responseTime ? `<span class="resp-time">${api.responseTime}ms</span>` : ''}
                        <span class="api-result ${apiClass}">${api.result || 'UNKNOWN'}</span>
                        <span class="expand-icon">▼</span>
                    </div>
                </div>
                <div class="api-body" style="display:none">

                    <div class="tab-bar">
                        <button class="tab-btn active" onclick="switchTab(this,'assertions-${idx}-${apiIdx}','tab-${idx}-${apiIdx}')">Assertions</button>
                        <button class="tab-btn" onclick="switchTab(this,'req-body-${idx}-${apiIdx}','tab-${idx}-${apiIdx}')">Request Body</button>
                        <button class="tab-btn" onclick="switchTab(this,'res-body-${idx}-${apiIdx}','tab-${idx}-${apiIdx}')">Response Body</button>
                        ${(reqHeaders || resHeaders) ? `<button class="tab-btn" onclick="switchTab(this,'headers-${idx}-${apiIdx}','tab-${idx}-${apiIdx}')">Headers</button>` : ''}
                    </div>

                    <div class="tab-content" id="assertions-${idx}-${apiIdx}" data-tab-group="tab-${idx}-${apiIdx}">
                        ${assertionTable}
                    </div>

                    <div class="tab-content" id="req-body-${idx}-${apiIdx}" data-tab-group="tab-${idx}-${apiIdx}" style="display:none">
                        <pre class="code-block">${escapeHtml(formatJson(api.requestBody))}</pre>
                    </div>

                    <div class="tab-content" id="res-body-${idx}-${apiIdx}" data-tab-group="tab-${idx}-${apiIdx}" style="display:none">
                        <pre class="code-block">${escapeHtml(formatJson(api.responseBody))}</pre>
                    </div>

                    ${(reqHeaders || resHeaders) ? `
                    <div class="tab-content" id="headers-${idx}-${apiIdx}" data-tab-group="tab-${idx}-${apiIdx}" style="display:none">
                        ${headerTables}
                    </div>` : ''}

                </div>
            </div>`;
        }).join('');

        return `
        <div class="test-panel" id="test-panel-${idx}" style="display:none">
            <div class="test-panel-header ${statusClass}">
                <div class="test-panel-title">
                    <span class="test-status-badge ${statusClass}">${statusLabel}</span>
                    <span class="test-name">${escapeHtml(iter.testCaseName || `Iteration ${iter.iteration}`)}</span>
                </div>
                <div class="test-panel-meta">
                    <span>Iteration: ${iter.iteration}</span>
                    <span>${iter.apis.length} API${iter.apis.length !== 1 ? 's' : ''}</span>
                </div>
            </div>
            <div class="api-list">
                ${apiBlocks}
            </div>
        </div>`;
    }).join('');

    // ── full HTML ───────────────────────────────────────

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>${escapeHtml(collectionName)} — Extent Report</title>
<style>
/* ── reset & base ─────────────────────────────────── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Segoe UI', Arial, sans-serif; background: #f0f2f5; color: #333; font-size: 13px; }
a { text-decoration: none; color: inherit; }

/* ── navbar ───────────────────────────────────────── */
.navbar {
    background: #1a1a2e;
    color: #fff;
    padding: 0 24px;
    height: 54px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    position: sticky;
    top: 0;
    z-index: 100;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
}
.navbar-brand { font-size: 17px; font-weight: 700; letter-spacing: 0.5px; }
.navbar-brand span { color: #4fc3f7; }
.navbar-meta { font-size: 11px; color: #aaa; display: flex; gap: 20px; }
.navbar-meta b { color: #ddd; }

/* ── dashboard ────────────────────────────────────── */
.dashboard {
    background: #16213e;
    padding: 20px 24px;
    display: flex;
    align-items: center;
    gap: 20px;
    flex-wrap: wrap;
    border-bottom: 1px solid #0f3460;
}
.dash-card {
    background: rgba(255,255,255,0.07);
    border-radius: 8px;
    padding: 14px 22px;
    min-width: 120px;
    text-align: center;
    border: 1px solid rgba(255,255,255,0.1);
}
.dash-card .dash-num {
    font-size: 28px;
    font-weight: 700;
    line-height: 1;
}
.dash-card .dash-label {
    font-size: 11px;
    color: #aaa;
    margin-top: 4px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}
.dash-card.total   .dash-num { color: #4fc3f7; }
.dash-card.passed  .dash-num { color: #66bb6a; }
.dash-card.failed  .dash-num { color: #ef5350; }
.dash-card.skipped .dash-num { color: #ffa726; }

.donut-wrap {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 16px;
}
.donut-wrap svg { transform: rotate(-90deg); }
.donut-labels { color: #eee; }
.donut-labels .pass-label { color: #66bb6a; font-size: 12px; font-weight: 600; }
.donut-labels .fail-label { color: #ef5350; font-size: 12px; font-weight: 600; }
.donut-labels .rate { font-size: 22px; font-weight: 700; color: #fff; }

.meta-strip {
    background: #0f3460;
    color: #ccc;
    font-size: 11px;
    padding: 8px 24px;
    display: flex;
    gap: 30px;
    flex-wrap: wrap;
    border-bottom: 1px solid #16213e;
}
.meta-strip b { color: #fff; }

/* ── main layout ──────────────────────────────────── */
.main {
    display: flex;
    height: calc(100vh - 54px - 92px - 32px);
    min-height: 500px;
}

/* ── sidebar ──────────────────────────────────────── */
.sidebar {
    width: 280px;
    min-width: 220px;
    background: #fff;
    border-right: 1px solid #e0e0e0;
    overflow-y: auto;
    flex-shrink: 0;
}
.sidebar-section-title {
    padding: 12px 16px 8px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: #888;
    border-bottom: 1px solid #f0f0f0;
    background: #fafafa;
    position: sticky;
    top: 0;
}
.sidebar-item {
    padding: 10px 16px;
    cursor: pointer;
    border-bottom: 1px solid #f5f5f5;
    display: flex;
    align-items: center;
    gap: 8px;
    transition: background 0.15s;
}
.sidebar-item:hover { background: #f5f5f5; }
.sidebar-item.active { background: #e8f5e9; border-left: 3px solid #43a047; }
.sidebar-item.fail.active { background: #ffebee; border-left: 3px solid #e53935; }
.sidebar-icon { font-size: 12px; width: 16px; text-align: center; flex-shrink: 0; }
.sidebar-item.pass .sidebar-icon { color: #43a047; }
.sidebar-item.fail .sidebar-icon { color: #e53935; }
.sidebar-name { flex: 1; font-size: 12px; word-break: break-word; line-height: 1.3; }
.sidebar-iter { font-size: 10px; color: #aaa; flex-shrink: 0; }

/* ── content area ─────────────────────────────────── */
.content {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
    background: #f0f2f5;
}
.placeholder {
    text-align: center;
    color: #bbb;
    margin-top: 80px;
    font-size: 15px;
}
.placeholder .ph-icon { font-size: 48px; margin-bottom: 12px; }

/* ── test panel ───────────────────────────────────── */
.test-panel-header {
    border-radius: 8px 8px 0 0;
    padding: 14px 18px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
}
.test-panel-header.pass { background: #e8f5e9; border-left: 4px solid #43a047; }
.test-panel-header.fail { background: #ffebee; border-left: 4px solid #e53935; }
.test-panel-title { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.test-name { font-size: 15px; font-weight: 600; color: #222; }
.test-status-badge {
    padding: 3px 10px;
    border-radius: 3px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.5px;
}
.test-status-badge.pass { background: #43a047; color: #fff; }
.test-status-badge.fail { background: #e53935; color: #fff; }
.test-panel-meta { font-size: 11px; color: #888; display: flex; gap: 14px; }

.api-list { background: #fff; border-radius: 0 0 8px 8px; border: 1px solid #e0e0e0; border-top: none; }

/* ── api block ────────────────────────────────────── */
.api-block { border-bottom: 1px solid #f0f0f0; }
.api-block:last-child { border-bottom: none; }
.api-header {
    padding: 10px 16px;
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
    transition: background 0.15s;
    flex-wrap: wrap;
}
.api-header:hover { background: #fafafa; }
.api-block.pass .api-header { border-left: 3px solid #43a047; }
.api-block.fail .api-header { border-left: 3px solid #e53935; }

.method-badge {
    font-size: 10px;
    font-weight: 700;
    padding: 2px 7px;
    border-radius: 3px;
    letter-spacing: 0.5px;
    flex-shrink: 0;
}
.method-badge.get    { background: #e3f2fd; color: #1565c0; }
.method-badge.post   { background: #e8f5e9; color: #2e7d32; }
.method-badge.put    { background: #fff8e1; color: #f57f17; }
.method-badge.patch  { background: #fce4ec; color: #880e4f; }
.method-badge.delete { background: #ffebee; color: #b71c1c; }

.api-name { font-weight: 600; font-size: 13px; }
.api-url  { font-size: 11px; color: #888; flex: 1; word-break: break-all; }
.api-meta { display: flex; align-items: center; gap: 10px; margin-left: auto; flex-shrink: 0; }

.status-code {
    font-size: 11px;
    font-weight: 700;
    padding: 2px 7px;
    border-radius: 3px;
}
.status-code.code-ok  { background: #e8f5e9; color: #2e7d32; }
.status-code.code-err { background: #ffebee; color: #c62828; }

.resp-time { font-size: 10px; color: #999; }

.api-result {
    font-size: 10px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 3px;
}
.api-result.pass { background: #43a047; color: #fff; }
.api-result.fail { background: #e53935; color: #fff; }

.expand-icon { color: #bbb; font-size: 10px; transition: transform 0.2s; }
.expanded .expand-icon { transform: rotate(180deg); }

/* ── api body / tabs ──────────────────────────────── */
.api-body { padding: 0 16px 14px; border-top: 1px solid #f5f5f5; }

.tab-bar {
    display: flex;
    gap: 4px;
    padding: 10px 0 6px;
    border-bottom: 1px solid #e8e8e8;
    flex-wrap: wrap;
}
.tab-btn {
    background: none;
    border: 1px solid #e0e0e0;
    border-radius: 4px 4px 0 0;
    padding: 5px 12px;
    font-size: 11px;
    cursor: pointer;
    color: #666;
    transition: all 0.15s;
}
.tab-btn:hover { background: #f5f5f5; }
.tab-btn.active { background: #1a1a2e; color: #fff; border-color: #1a1a2e; }

/* ── assertions table ─────────────────────────────── */
.assert-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 10px;
    font-size: 12px;
}
.assert-table th {
    background: #f5f5f5;
    padding: 6px 10px;
    text-align: left;
    font-weight: 600;
    color: #555;
    border-bottom: 2px solid #e0e0e0;
}
.assert-table td { padding: 7px 10px; border-bottom: 1px solid #f0f0f0; vertical-align: top; }
.assert-pass td:first-child { color: #43a047; }
.assert-fail td:first-child { color: #e53935; }
.assert-fail { background: #fff8f8; }
.assert-icon { font-size: 12px; }
.assert-error { color: #c62828; font-size: 11px; font-family: monospace; }
.badge-pass { background: #e8f5e9; color: #2e7d32; padding: 2px 8px; border-radius: 3px; font-size: 10px; font-weight: 700; }
.badge-fail { background: #ffebee; color: #c62828; padding: 2px 8px; border-radius: 3px; font-size: 10px; font-weight: 700; }
.no-assertions { color: #aaa; font-size: 12px; padding: 12px 0; font-style: italic; }

/* ── code block ───────────────────────────────────── */
.code-block {
    background: #1e1e1e;
    color: #d4d4d4;
    padding: 14px;
    border-radius: 4px;
    font-size: 11px;
    font-family: 'Courier New', Consolas, monospace;
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-word;
    margin-top: 10px;
    line-height: 1.5;
    max-height: 400px;
    overflow-y: auto;
}

/* ── header tables ────────────────────────────────── */
.headers-row { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 10px; }
.header-block { flex: 1; min-width: 280px; }
.block-label { font-size: 11px; font-weight: 700; color: #666; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }
.header-table { width: 100%; border-collapse: collapse; font-size: 11px; }
.header-table th { background: #f5f5f5; padding: 5px 10px; text-align: left; font-weight: 600; border-bottom: 1px solid #e0e0e0; }
.header-table td { padding: 5px 10px; border-bottom: 1px solid #f5f5f5; word-break: break-all; }

/* ── scrollbar ────────────────────────────────────── */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: #f5f5f5; }
::-webkit-scrollbar-thumb { background: #ccc; border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: #aaa; }
</style>
</head>
<body>

<!-- NAVBAR -->
<div class="navbar">
    <div class="navbar-brand">⚡ <span>Extent</span> Report</div>
    <div class="navbar-meta">
        <span><b>Collection:</b> ${escapeHtml(collectionName)}</span>
        <span><b>Folder:</b> ${escapeHtml(folderName)}</span>
        <span><b>Generated:</b> ${new Date().toLocaleString()}</span>
    </div>
</div>

<!-- DASHBOARD -->
<div class="dashboard">
    <div class="dash-card total">
        <div class="dash-num">${totalIterations}</div>
        <div class="dash-label">Total Tests</div>
    </div>
    <div class="dash-card passed">
        <div class="dash-num">${passedIterations}</div>
        <div class="dash-label">Passed</div>
    </div>
    <div class="dash-card failed">
        <div class="dash-num">${failedIterations}</div>
        <div class="dash-label">Failed</div>
    </div>
    <div class="dash-card total">
        <div class="dash-num">${totalApis}</div>
        <div class="dash-label">Total APIs</div>
    </div>
    <div class="dash-card total">
        <div class="dash-num">${totalAssertions}</div>
        <div class="dash-label">Assertions</div>
    </div>
    <div class="dash-card passed">
        <div class="dash-num">${passedAssertions}</div>
        <div class="dash-label">Assert Passed</div>
    </div>
    <div class="dash-card failed">
        <div class="dash-num">${failedAssertions}</div>
        <div class="dash-label">Assert Failed</div>
    </div>

    <div class="donut-wrap">
        <svg width="80" height="80" viewBox="0 0 90 90">
            <circle cx="45" cy="45" r="40" fill="none" stroke="#ef5350" stroke-width="10"/>
            <circle cx="45" cy="45" r="40" fill="none" stroke="#66bb6a" stroke-width="10"
                stroke-dasharray="${donutPass} ${donutFail}"
                stroke-dashoffset="0"/>
        </svg>
        <div class="donut-labels">
            <div class="rate">${passRate}%</div>
            <div class="pass-label">✔ ${passedIterations} Passed</div>
            <div class="fail-label">✖ ${failedIterations} Failed</div>
        </div>
    </div>
</div>

<!-- META STRIP -->
<div class="meta-strip">
    <span><b>Start:</b> ${startTime}</span>
    <span><b>End:</b> ${endTime}</span>
    <span><b>Duration:</b> ${duration}</span>
    <span><b>Pass Rate:</b> ${passRate}%</span>
</div>

<!-- MAIN -->
<div class="main">

    <!-- SIDEBAR -->
    <div class="sidebar">
        <div class="sidebar-section-title">Test Cases</div>
        ${sidebarItems}
    </div>

    <!-- CONTENT -->
    <div class="content" id="content">
        <div class="placeholder" id="placeholder">
            <div class="ph-icon">📋</div>
            <div>Select a test case from the left to view details</div>
        </div>
        ${testPanels}
    </div>

</div>

<script>
var activeIdx = null;

function showTest(idx) {

    // hide placeholder
    document.getElementById('placeholder').style.display = 'none';

    // hide all panels
    document.querySelectorAll('.test-panel').forEach(function(p) {
        p.style.display = 'none';
    });

    // deactivate all sidebar items
    document.querySelectorAll('.sidebar-item').forEach(function(s) {
        s.classList.remove('active');
    });

    // show selected
    document.getElementById('test-panel-' + idx).style.display = 'block';
    document.getElementById('sidebar-' + idx).classList.add('active');

    activeIdx = idx;

    // scroll content to top
    document.getElementById('content').scrollTop = 0;
}

function toggleApi(id) {
    var block  = document.getElementById(id);
    var body   = block.querySelector('.api-body');
    var header = block.querySelector('.api-header');
    if (body.style.display === 'none') {
        body.style.display = 'block';
        header.classList.add('expanded');
    } else {
        body.style.display = 'none';
        header.classList.remove('expanded');
    }
}

function switchTab(btn, tabId, groupId) {
    // hide all tabs in group
    document.querySelectorAll('[data-tab-group="' + groupId + '"]').forEach(function(t) {
        t.style.display = 'none';
    });
    // deactivate all tab buttons in the same tab-bar
    btn.closest('.tab-bar').querySelectorAll('.tab-btn').forEach(function(b) {
        b.classList.remove('active');
    });
    // show target + activate button
    document.getElementById(tabId).style.display = 'block';
    btn.classList.add('active');
}

// auto-select first item
if (document.querySelector('.sidebar-item')) {
    showTest(0);
}
</script>

</body>
</html>`;

    // ── write file ──────────────────────────────────────

    const outputFile = path.join(reportFolder, 'extent-report.html');
    fs.writeFileSync(outputFile, html, 'utf8');
    console.log(`📊 Extent Report Generated: ${outputFile}`);
}

module.exports = generateExtentReport;