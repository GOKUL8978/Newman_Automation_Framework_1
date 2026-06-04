// ======================================
// scripts/generate-text-report.js
//
// Generates a single .txt evidence file
// containing all iterations.
// Each iteration includes all APIs that
// ran in that iteration.
// ======================================

const fs   = require('fs');
const path = require('path');

/**
 * Generates a single text evidence file.
 *
 * @param {string} reportFolder  - Output folder path
 * @param {Array}  evidenceData  - Array of evidence entries.
 *
 * Each entry is:
 * {
 *   iteration:    number,
 *   testCaseName: string,
 *   apis: [
 *     {
 *       apiName:      string,
 *       statusCode:   number|string,
 *       requestBody:  string,
 *       responseBody: string,
 *       result:       'PASSED' | 'FAILED'
 *     }
 *   ]
 * }
 */
function generateTextReport(reportFolder, evidenceData) {

    if (!evidenceData || evidenceData.length === 0) {
        console.log('⚠️  No evidence data available for text report');
        return;
    }

    const LINE_DOUBLE = '='.repeat(80);
    const LINE_SINGLE = '-'.repeat(80);

    let content = '';

    evidenceData.forEach((iterItem, iterIndex) => {

        // ======================================
        // ITERATION HEADER
        // ======================================

        content += `${LINE_DOUBLE}\n`;
        content += `ITERATION: ${iterItem.iteration}\n`;
        content += `${LINE_DOUBLE}\n\n`;

        // TEST CASE NAME
        content += `TEST CASE NAME\n`;
        content += `${LINE_SINGLE}\n`;
        content += `${iterItem.testCaseName || `Iteration ${iterItem.iteration}`}\n\n`;

        // OVERALL RESULT
        const overallResult =
            iterItem.apis.some(a => a.result === 'FAILED')
                ? 'FAILED'
                : 'PASSED';

        content += `OVERALL RESULT\n`;
        content += `${LINE_SINGLE}\n`;
        content += `${overallResult}\n\n`;

        // ======================================
        // ONE BLOCK PER API
        // ======================================

        iterItem.apis.forEach((api, apiIndex) => {

            content += `${LINE_SINGLE}\n`;
            content += `API #${apiIndex + 1}: ${api.apiName || 'Unknown'}\n`;
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

    // ======================================
    // WRITE TO SINGLE FILE
    // ======================================

    const outputFile = path.join(reportFolder, 'ExecutionEvidence.txt');

    fs.writeFileSync(outputFile, content, 'utf8');

    console.log(`📄 Text Evidence Generated: ${outputFile}`);
}

module.exports = generateTextReport;
