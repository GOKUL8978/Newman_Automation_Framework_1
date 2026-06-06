// ======================================================
// scripts/generate-text-report.js
//
// Generates a single .txt evidence file containing
// all iterations.
// Multiple APIs within one iteration are included
// sequentially under the same iteration block.
// ======================================================

const fs   = require('fs');
const path = require('path');

/**
 * @param {string} reportFolder
 * @param {Array}  evidenceData
 *
 * evidenceData shape:
 * [
 *   {
 *     iteration:    number,
 *     testCaseName: string,
 *     apis: [
 *       {
 *         apiName:      string,
 *         statusCode:   string|number,
 *         requestBody:  string,
 *         responseBody: string,
 *         result:       'PASSED'|'FAILED'
 *       }
 *     ]
 *   }
 * ]
 */
function generateTextReport(
    reportFolder,
    evidenceData
) {

    if (
        !evidenceData ||
        evidenceData.length === 0
    ) {
        console.log('⚠️  No evidence data for text report');
        return;
    }

    const LINE_DOUBLE = '='.repeat(80);
    const LINE_SINGLE = '-'.repeat(80);

    let content = '';

    evidenceData.forEach(iterItem => {

        // ── iteration header ────────────────────────────

        content += `${LINE_DOUBLE}\n`;
        content += `ITERATION: ${iterItem.iteration}\n`;
        content += `${LINE_DOUBLE}\n\n`;

        content += `TEST CASE NAME\n`;
        content += `${LINE_SINGLE}\n`;
        content += `${iterItem.testCaseName || `Iteration ${iterItem.iteration}`}\n\n`;

        const overallResult =
            iterItem.apis.some(a => a.result === 'FAILED')
                ? 'FAILED'
                : 'PASSED';

        content += `OVERALL RESULT\n`;
        content += `${LINE_SINGLE}\n`;
        content += `${overallResult}\n\n`;

        // ── one block per API ───────────────────────────

        iterItem.apis.forEach((api, apiIdx) => {

            content += `${LINE_SINGLE}\n`;
            content += `API #${apiIdx + 1}: ${api.apiName || 'Unknown'}\n`;
            content += `${LINE_SINGLE}\n\n`;

            content += `API NAME\n`;
            content += `${api.apiName || ''}\n\n`;

            content += `RESPONSE STATUS CODE\n`;
            content += `${api.statusCode || ''}\n\n`;

            content += `TEST RESULT\n`;
            content += `${api.result || ''}\n\n`;

            content += `RAW REQUEST BODY\n`;
            content += `${api.requestBody || '(empty)'}\n\n`;

            content += `RAW RESPONSE BODY\n`;
            content += `${api.responseBody || '(empty)'}\n\n`;
        });

        content += `${LINE_DOUBLE}\n`;
        content += `END OF ITERATION ${iterItem.iteration}\n`;
        content += `${LINE_DOUBLE}\n\n\n`;
    });

    // ── write single file ───────────────────────────────

    const outputFile =
        path.join(
            reportFolder,
            'ExecutionEvidence.txt'
        );

    fs.writeFileSync(outputFile, content, 'utf8');

    console.log(
        `📄 Text Evidence Generated: ${outputFile}`
    );
}

module.exports = generateTextReport;
