// ======================================
// scripts/generate-word-report.js
//
// Generates a Word (.docx) evidence report.
// Each iteration = one full page.
// Multiple APIs per iteration are all
// included on the same page, separated
// by a horizontal divider.
// ======================================

const fs   = require('fs');
const path = require('path');

const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    HeadingLevel,
    PageBreak,
    BorderStyle,
    Table,
    TableRow,
    TableCell,
    WidthType,
    AlignmentType
} = require('docx');

// ======================================
// HELPER: Bold label paragraph
// ======================================

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

// ======================================
// HELPER: Normal value paragraph
// ======================================

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

// ======================================
// HELPER: Monospace body paragraph
// (for request/response JSON)
// ======================================

function monoText(text) {
    const safeText = String(text || '');
    // Split on newlines to preserve formatting
    const lines = safeText.split('\n');
    return lines.map(line =>
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

// ======================================
// HELPER: Divider between APIs
// within the same iteration
// ======================================

function divider() {
    return new Paragraph({
        border: {
            bottom: {
                color: 'AAAAAA',
                space: 1,
                style: BorderStyle.SINGLE,
                size: 6
            }
        },
        spacing: { before: 200, after: 200 }
    });
}

// ======================================
// HELPER: Section heading
// ======================================

function sectionHeading(text) {
    return new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [
            new TextRun({
                text,
                bold: true,
                color: '2E4057',
                size: 24
            })
        ],
        spacing: { before: 240, after: 120 }
    });
}

// ======================================
// MAIN EXPORT
// ======================================

/**
 * Generates Word evidence report.
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
async function generateWordReport(reportFolder, evidenceData) {

    if (!evidenceData || evidenceData.length === 0) {
        console.log('⚠️  No evidence data available for Word report');
        return;
    }

    const children = [];

    evidenceData.forEach((iterItem, iterIndex) => {

        // ======================================
        // PAGE BREAK between iterations
        // (not before the first page)
        // ======================================

        if (iterIndex > 0) {
            children.push(
                new Paragraph({
                    children: [ new PageBreak() ]
                })
            );
        }

        // ======================================
        // PAGE TITLE
        // ======================================

        children.push(
            new Paragraph({
                heading: HeadingLevel.HEADING_1,
                children: [
                    new TextRun({
                        text: 'API EXECUTION EVIDENCE',
                        bold: true,
                        color: '1A1A2E',
                        size: 32
                    })
                ],
                spacing: { after: 200 }
            })
        );

        // ======================================
        // ITERATION & TEST CASE SUMMARY
        // ======================================

        children.push(
            boldLabel('TEST CASE NAME'),
            valueText(iterItem.testCaseName || `Iteration ${iterItem.iteration}`),

            boldLabel('ITERATION'),
            valueText(String(iterItem.iteration))
        );

        // ======================================
        // OVERALL RESULT
        // Derive from APIs: FAILED if any failed
        // ======================================

        const overallResult =
            iterItem.apis.some(a => a.result === 'FAILED')
                ? 'FAILED'
                : 'PASSED';

        children.push(
            boldLabel('OVERALL RESULT'),
            new Paragraph({
                children: [
                    new TextRun({
                        text: overallResult,
                        bold: true,
                        color: overallResult === 'PASSED' ? '006400' : 'CC0000',
                        size: 22
                    })
                ],
                spacing: { after: 200 }
            })
        );

        // ======================================
        // ONE BLOCK PER API
        // ======================================

        iterItem.apis.forEach((api, apiIndex) => {

            if (apiIndex > 0) {
                children.push(divider());
            }

            children.push(
                sectionHeading(`API #${apiIndex + 1}: ${api.apiName || 'Unknown'}`)
            );

            // API Name
            children.push(
                boldLabel('API NAME'),
                valueText(api.apiName || '')
            );

            // Status Code
            children.push(
                boldLabel('RESPONSE STATUS CODE'),
                valueText(String(api.statusCode || ''))
            );

            // Result
            children.push(
                boldLabel('TEST RESULT'),
                new Paragraph({
                    children: [
                        new TextRun({
                            text: api.result || '',
                            bold: true,
                            color: api.result === 'PASSED' ? '006400' : 'CC0000',
                            size: 22
                        })
                    ],
                    spacing: { after: 80 }
                })
            );

            // Raw Request Body
            children.push(
                boldLabel('RAW REQUEST BODY'),
                ...monoText(api.requestBody || '(empty)')
            );

            // Raw Response Body
            children.push(
                boldLabel('RAW RESPONSE BODY'),
                ...monoText(api.responseBody || '(empty)')
            );
        });
    });

    // ======================================
    // BUILD DOCUMENT
    // ======================================

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

    const buffer = await Packer.toBuffer(doc);

    const outputFile = path.join(reportFolder, 'ExecutionEvidence.docx');

    fs.writeFileSync(outputFile, buffer);

    console.log(`📄 Word Evidence Generated: ${outputFile}`);
}

module.exports = generateWordReport;
