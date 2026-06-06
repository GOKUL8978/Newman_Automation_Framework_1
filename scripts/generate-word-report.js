// ======================================================
// scripts/generate-word-report.js
//
// Generates a Word (.docx) evidence report.
//
// Layout:
//   • One full page per iteration
//   • Page break between iterations
//   • Multiple APIs in one iteration appear on the
//     same page, separated by a horizontal rule
// ======================================================

const fs   = require('fs');
const path = require('path');

const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    HeadingLevel,
    PageBreak,
    BorderStyle
} = require('docx');

// ── helpers ────────────────────────────────────────────

function boldLabel(text) {

    return new Paragraph({
        children: [
            new TextRun({
                text,
                bold: true,
                size: 22
            })
        ],
        spacing: { before: 160, after: 60 }
    });
}

function valueText(text) {

    return new Paragraph({
        children: [
            new TextRun({
                text: String(text || ''),
                size: 20
            })
        ],
        spacing: { after: 80 }
    });
}

function resultText(result) {

    const isPass =
        result === 'PASSED';

    return new Paragraph({
        children: [
            new TextRun({
                text:  result || '',
                bold:  true,
                color: isPass ? '006400' : 'CC0000',
                size:  22
            })
        ],
        spacing: { after: 80 }
    });
}

function monoLines(text) {

    return String(text || '(empty)')
        .split('\n')
        .map(line =>
            new Paragraph({
                children: [
                    new TextRun({
                        text: line,
                        font: 'Courier New',
                        size: 18
                    })
                ],
                spacing: { after: 0 }
            })
        );
}

function ruleDivider() {

    return new Paragraph({
        border: {
            bottom: {
                color: 'AAAAAA',
                space: 1,
                style: BorderStyle.SINGLE,
                size:  6
            }
        },
        spacing: { before: 200, after: 200 }
    });
}

function apiHeading(text) {

    return new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [
            new TextRun({
                text,
                bold:  true,
                color: '2E4057',
                size:  24
            })
        ],
        spacing: { before: 240, after: 120 }
    });
}

// ── main export ────────────────────────────────────────

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
async function generateWordReport(
    reportFolder,
    evidenceData
) {

    if (
        !evidenceData ||
        evidenceData.length === 0
    ) {
        console.log('⚠️  No evidence data for Word report');
        return;
    }

    const children = [];

    evidenceData.forEach((iterItem, iterIndex) => {

        // ── page break between iterations ──────────────

        if (iterIndex > 0) {
            children.push(
                new Paragraph({
                    children: [ new PageBreak() ]
                })
            );
        }

        // ── page title ──────────────────────────────────

        children.push(
            new Paragraph({
                heading: HeadingLevel.HEADING_1,
                children: [
                    new TextRun({
                        text:  'API EXECUTION EVIDENCE',
                        bold:  true,
                        color: '1A1A2E',
                        size:  32
                    })
                ],
                spacing: { after: 200 }
            })
        );

        // ── iteration summary ───────────────────────────

        const overallResult =
            iterItem.apis.some(a => a.result === 'FAILED')
                ? 'FAILED'
                : 'PASSED';

        children.push(
            boldLabel('TEST CASE NAME'),
            valueText(
                iterItem.testCaseName ||
                `Iteration ${iterItem.iteration}`
            ),

            boldLabel('ITERATION'),
            valueText(String(iterItem.iteration)),

            boldLabel('OVERALL RESULT'),
            resultText(overallResult)
        );

        // ── one block per API ───────────────────────────

        iterItem.apis.forEach((api, apiIdx) => {

            if (apiIdx > 0) {
                children.push(ruleDivider());
            }

            children.push(
                apiHeading(
                    `API #${apiIdx + 1}: ${api.apiName || 'Unknown'}`
                ),

                boldLabel('API NAME'),
                valueText(api.apiName || ''),

                boldLabel('RESPONSE STATUS CODE'),
                valueText(String(api.statusCode || '')),

                boldLabel('TEST RESULT'),
                resultText(api.result || 'UNKNOWN'),

                boldLabel('RAW REQUEST BODY'),
                ...monoLines(api.requestBody),

                boldLabel('RAW RESPONSE BODY'),
                ...monoLines(api.responseBody)
            );
        });
    });

    // ── build document ──────────────────────────────────

    const doc = new Document({
        sections: [
            {
                properties: {
                    page: {
                        margin: {
                            top:    720,
                            right:  720,
                            bottom: 720,
                            left:   720
                        }
                    }
                },
                children
            }
        ]
    });

    const buffer =
        await Packer.toBuffer(doc);

    const outputFile =
        path.join(
            reportFolder,
            'ExecutionEvidence.docx'
        );

    fs.writeFileSync(outputFile, buffer);

    console.log(
        `Word Evidence Generated: ${outputFile}`
    );
}

module.exports = generateWordReport;
