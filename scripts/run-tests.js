// ======================================================
// scripts/run-tests.js
// ======================================================
//
// FLOW:
//   1. Read framework.properties
//   2. Load live-collection.json from collectionOutputPath
//      → Run download-collection.js first if file is missing
//   3. Run target folder from live collection
//      → HTML report, evidence (docx or txt)
//      → update CSV/Excel data file
//      → optionally copy data file to report folder
//
// To refresh the collection from Postman at any time:
//   node download-collection.js
//
// ======================================================

const fs     = require('fs');
const path   = require('path');
const Papa   = require('papaparse');
const newman = require('newman');
const XLSX   = require('xlsx');
const yaml   = require('js-yaml');

const readProperties       = require('./properties-reader');
const generateWordReport   = require('./generate-word-report');
const generateTextReport   = require('./generate-text-report');
const generateExtentReport = require('./generate-extent-report');

const {
    getValueFromPath,
    getFileConfig,
    sanitizeRow
} = require('./utils');

// ======================================================
// LOAD FRAMEWORK CONFIG
// ======================================================

const framework =
    readProperties('./config/framework.properties');

// ── new config values ──────────────────────────────────

const evidenceFormat =
    (framework.evidenceFormat || 'docx')
        .toLowerCase()
        .trim();

const copyTestDataToReports =
    (framework.copyTestDataToReports || 'true')
        .toLowerCase()
        .trim() === 'true';

const testCaseNameColumn =
    (framework.testCaseNameColumn || 'testCaseName')
        .trim();

const testScenarioTypeColumn =
    (framework.testScenarioTypeColumn || '')
        .trim();

console.log('\n📋 Framework Configuration');
console.log(`   Evidence Format:          ${evidenceFormat.toUpperCase()}`);
console.log(`   Copy Test Data:           ${copyTestDataToReports}`);
console.log(`   Test Case Name Column:    ${testCaseNameColumn}`);
console.log(`   Scenario Type Column:     ${testScenarioTypeColumn || '(not set)'}`);

// ======================================================
// INPUTS FROM runner.js
// ======================================================

const targetFolder =
    process.argv[2];

const iterationCount =
    process.argv[3];

// ======================================================
// COLLECTION OUTPUT PATH
// ======================================================

const collectionOutputPath =
    framework.collectionOutputPath ||
    './collection/live-collection.json';

// ======================================================
// LOAD MAPPING FILES
// ======================================================

const isYaml =
    framework.mappingType === 'yaml';

// ── API field mapping (csv_update) ─────────────────────

let apiFieldMapping = {};

try {

    apiFieldMapping = isYaml
        ? yaml.load(
            fs.readFileSync('./config/csv_update.yaml', 'utf8')
          )
        : JSON.parse(
            fs.readFileSync('./config/csv_update.json', 'utf8')
          );

} catch {

    console.log(
        'ℹ️  No API field mapping found (csv_update) — skipping field extraction'
    );
}

// ── folder mapping ─────────────────────────────────────

let folderCsvMap = {};

try {

    folderCsvMap = isYaml
        ? yaml.load(
            fs.readFileSync('./config/folderMapping.yaml', 'utf8')
          )
        : JSON.parse(
            fs.readFileSync('./config/folderMapping.json', 'utf8')
          );

} catch {

    console.log(
        'ℹ️  No folder mapping found — running without data file'
    );
}

// ======================================================
// REPORT FOLDER
// ======================================================

const timestamp =
    new Date()
        .toISOString()
        .replace(/[:.]/g, '-');

const reportFolder =
    `./reports/${targetFolder || 'ROOT'}_${timestamp}`;

// evidence folder removed — individual txt files not generated

// ======================================================
// GET INPUT FILE FOR TARGET FOLDER
// ======================================================

let currentFolderConfig = null;

if (targetFolder && folderCsvMap[targetFolder]) {

    currentFolderConfig =
        getFileConfig(folderCsvMap, targetFolder);

} else if (folderCsvMap['ROOT']) {

    currentFolderConfig =
        getFileConfig(folderCsvMap, 'ROOT');
}

const inputFile =
    currentFolderConfig?.file || null;

// ======================================================
// READ EXCEL DATA → array of row objects
// ======================================================

function readExcelData(excelPath, worksheetName) {

    const workbook =
        XLSX.readFile(excelPath, { cellDates: true });

    if (
        !worksheetName ||
        !workbook.SheetNames.includes(worksheetName)
    ) {
        worksheetName = workbook.SheetNames[0];
        console.log(`📄 Using first worksheet: ${worksheetName}`);
    } else {
        console.log(`📄 Using worksheet: ${worksheetName}`);
    }

    const worksheet =
        workbook.Sheets[worksheetName];

    // raw: true  → dates come back as JS Date objects, booleans as true/false
    // defval: '' → missing cells become empty string (not undefined)
    const rawRows =
        XLSX.utils.sheet_to_json(
            worksheet,
            { defval: '', raw: true }
        );

    // Normalise every row: yyyy-mm-dd dates, lowercase booleans.
    // Invalid date strings are passed through unchanged so that
    // negative-scenario rows still reach the API as-is.
    return rawRows.map(row => sanitizeRow(row));
}

// ======================================================
// SSL OPTIONS
// ======================================================

const sslOptions = {
    enabled:    framework.sslEnabled === 'true',
    cert:       framework.sslEnabled === 'true'
                    ? fs.readFileSync(framework.sslCert)
                    : null,
    key:        framework.sslEnabled === 'true'
                    ? fs.readFileSync(framework.sslKey)
                    : null,
    passphrase: framework.sslPassphrase
};

// ======================================================
// STORES
// ======================================================

// iterationApiStore[i] = [ { apiName, statusCode, requestBody, responseBody, result } ]
const iterationApiStore = {};

// responseStore[storeKey][i] = { col: value, ... }
const responseStore = {};

// resultStore[storeKey][i] = 'PASSED' | 'FAILED'
const resultStore = {};

// Raw data rows for test case name lookup
let iterationDataRows = [];

// ======================================================
// BUILD REQUEST → FOLDER MAP
// (walks the loaded collection tree)
// ======================================================

function buildRequestFolderMap(
    items,
    currentFolder = null,
    map = {}
) {

    if (!Array.isArray(items)) return map;

    items.forEach(item => {

        if (item.item) {

            buildRequestFolderMap(
                item.item,
                item.name,
                map
            );

        } else {

            map[item.name] =
                currentFolder || 'ROOT';
        }
    });

    return map;
}

// ======================================================
// MAIN
// ======================================================

async function main() {

    // ── 1. load live-collection.json ───────────────────
    //
    // Run  node download-collection.js  first if you
    // need to pull the latest version from Postman.

    if (!fs.existsSync(path.resolve(collectionOutputPath))) {
        console.log(
            `\n❌  Collection file not found: ${collectionOutputPath}` +
            `\n    Run this first to download it from Postman:` +
            `\n    node download-collection.js\n`
        );
        process.exit(1);
    }

    let liveCollection;

    try {

        const raw =
            fs.readFileSync(
                path.resolve(collectionOutputPath),
                'utf8'
            );

        liveCollection = JSON.parse(raw);

    } catch (err) {
        console.log(
            `❌  Failed to load collection from: ${collectionOutputPath}\n` +
            `    ${err.message}\n` +
            `    Run: node download-collection.js`
        );
        process.exit(1);
    }

    console.log(
        `\n📦 Collection loaded: "${liveCollection.info?.name || collectionOutputPath}"` +
        `\n🚀 Starting test run: ${targetFolder || 'ROOT'}`
    );

    // ── 4. build request→folder map ────────────────────

    const requestFolderMap =
        buildRequestFolderMap(liveCollection.item);

    // ── 5. build newman options ────────────────────────

    const newmanOptions = {

        collection: liveCollection,

        reporters: ['cli', 'htmlextra'],

        reporter: {
            htmlextra: {
                export:           `${reportFolder}/report.html`,
                title:            `${targetFolder || 'ROOT'} Report`,
                showIterationData: true,
                logs:              true,
                browserTitle:      'Automation Report'
            }
        },

        timeout:        0,
        timeoutRequest: 0,
        timeoutScript:  0
    };

    // iteration count
    if (
        iterationCount !== undefined &&
        iterationCount !== null &&
        iterationCount !== '' &&
        !isNaN(iterationCount)
    ) {
        newmanOptions.iterationCount =
            Number(iterationCount);

        console.log(
            `🔁 Running ${iterationCount} iterations`
        );

    } else {

        console.log('🔁 Running ALL iterations');
    }

    // folder filter
    if (targetFolder) {
        newmanOptions.folder = targetFolder;
    }

    // data file
    if (inputFile) {

        if (inputFile.endsWith('.xlsx')) {

            const rows =
                readExcelData(
                    inputFile,
                    currentFolderConfig?.worksheet
                );

            iterationDataRows = rows;
            newmanOptions.iterationData = rows;

            console.log(`📘 Using Excel File: ${inputFile}`);

        } else {

            // CSV — pre-read rows so we can look up testCaseName
            try {
                const csvContent =
                    fs.readFileSync(inputFile, 'utf8');

                const parsed =
                    Papa.parse(csvContent, {
                        header: true,
                        skipEmptyLines: true
                    });

                iterationDataRows = parsed.data.map(row => sanitizeRow(row));

            } catch {
                iterationDataRows = [];
            }

            newmanOptions.iterationData = iterationDataRows;

            console.log(`📄 Using CSV File: ${inputFile}`);
        }

    } else {

        console.log('ℹ️  Running without data file');
    }

    // SSL
    if (sslOptions.enabled) {

        console.log('🔐 SSL Enabled');

        newmanOptions.sslClientCert =
            sslOptions.cert;

        newmanOptions.sslClientKey =
            sslOptions.key;

        newmanOptions.sslClientPassphrase =
            sslOptions.passphrase;
    }

    // ── 6. run newman ──────────────────────────────────

    const runStartTime = new Date();

    newman.run(newmanOptions)

    // ── REQUEST EVENT ──────────────────────────────────

    .on('request', (err, args) => {

        if (err) return;

        const requestName =
            args.item.name;

        const folderName =
            requestFolderMap[requestName] || 'ROOT';

        // skip requests outside the target folder
        if (
            targetFolder &&
            folderName !== targetFolder &&
            requestName !== targetFolder
        ) {
            return;
        }

        const iteration =
            args.cursor.iteration;

        const requestBody =
            args.request.body?.raw || '';

        const responseBody =
            args.response.stream.toString();

        const statusCode =
            args.response.code;

        // ── console output ─────────────────────────────

        console.log('\n================================');
        console.log(`API:         ${requestName}`);
        console.log(`Iteration:   ${iteration}`);
        console.log(`Status Code: ${statusCode}`);
        console.log('\nREQUEST BODY:\n');
        console.log(requestBody);
        console.log('\nRESPONSE BODY:\n');
        console.log(responseBody);
        console.log('\n================================');

        // ── collect for report ─────────────────────────

        if (!iterationApiStore[iteration]) {
            iterationApiStore[iteration] = [];
        }

        iterationApiStore[iteration].push({
            apiName:         requestName,
            method:          args.request.method || 'GET',
            url:             args.request.url?.toString() || '',
            statusCode:      statusCode,
            requestBody:     requestBody,
            responseBody:    responseBody,
            requestHeaders:  (() => {
                const h = {};
                (args.request.headers?.members || []).forEach(m => {
                    if (m.key) h[m.key] = m.value || '';
                });
                return h;
            })(),
            responseHeaders: (() => {
                const h = {};
                (args.response.headers?.members || []).forEach(m => {
                    if (m.key) h[m.key] = m.value || '';
                });
                return h;
            })(),
            responseTime:    args.response.responseTime || 0,
            result:          null,   // filled in 'done'
            assertions:      []      // filled in 'done'
        });

        // ── response field extraction ──────────────────

        const storeKey =
            targetFolder === requestName
                ? targetFolder
                : folderName;

        if (!responseStore[storeKey]) {
            responseStore[storeKey] = [];
        }

        if (!responseStore[storeKey][iteration]) {
            responseStore[storeKey][iteration] = {};
        }

        responseStore[storeKey][iteration].requestBody  = requestBody;
        responseStore[storeKey][iteration].responseBody = responseBody;
        responseStore[storeKey][iteration].responseStatusCode = statusCode;

        try {

            const res = JSON.parse(responseBody);

            const mapping =
                apiFieldMapping[requestName];

            if (mapping && mapping !== null) {

                Object.keys(mapping).forEach(col => {

                    responseStore[storeKey][iteration][col] =
                        getValueFromPath(res, mapping[col]);
                });
            }

        } catch {

            console.log(
                `⚠️  Non-JSON response for: ${requestName}`
            );
        }
    })

    // ── DONE EVENT ─────────────────────────────────────

    .on('done', async (err, summary) => {

        if (err) {
            console.log(err);
            process.exit(1);
        }

        // ── collect pass/fail per API per iteration ────

        summary.run.executions.forEach(exec => {

            const requestName =
                exec.item.name;

            const folderName =
                requestFolderMap[requestName] || 'ROOT';

            if (
                targetFolder &&
                folderName !== targetFolder &&
                requestName !== targetFolder
            ) {
                return;
            }

            const i =
                exec.cursor.iteration;

            const passed =
                exec.assertions?.every(a => !a.error) ?? true;

            const result =
                passed ? 'PASSED' : 'FAILED';

            // mark result + assertions in iterationApiStore
            if (iterationApiStore[i]) {

                const apiEntry =
                    iterationApiStore[i].find(
                        a => a.apiName === requestName
                    );

                if (apiEntry) {
                    apiEntry.result = result;
                    apiEntry.assertions = (exec.assertions || []).map(a => ({
                        name:   a.assertion || '',
                        passed: !a.error,
                        error:  a.error ? a.error.message || String(a.error) : null
                    }));
                }
            }

            // result store for CSV/Excel update
            const storeKey =
                targetFolder === requestName
                    ? targetFolder
                    : folderName;

            if (!resultStore[storeKey]) {
                resultStore[storeKey] = [];
            }

            resultStore[storeKey][i] = result;
        });

        // ── assemble evidence data ─────────────────────

        const evidenceData = [];

        const iterations =
            Object.keys(iterationApiStore)
                .map(Number)
                .sort((a, b) => a - b);

        iterations.forEach(iter => {

            const testCaseName =
                iterationDataRows[iter]
                    ? (
                        iterationDataRows[iter][testCaseNameColumn] ||
                        `Iteration ${iter}`
                      )
                    : `Iteration ${iter}`;

            const scenarioType =
                testScenarioTypeColumn && iterationDataRows[iter]
                    ? (iterationDataRows[iter][testScenarioTypeColumn] || '')
                    : '';

            // Filter out APIs whose result was never set in the done event.
            // These are ghost entries from pre/post hooks or out-of-scope
            // requests captured by the request event but not in executions.
            const apis =
                iterationApiStore[iter]
                    .filter(api => api.result !== null)
                    .map(api => ({
                        ...api,
                        result: api.result || 'UNKNOWN'
                    }));

            evidenceData.push({
                iteration:    iter,
                testCaseName,
                scenarioType,
                apis
            });
        });

        // ── generate evidence report ───────────────────

        if (evidenceData.length > 0) {

            if (evidenceFormat === 'txt') {

                generateTextReport(
                    reportFolder,
                    evidenceData
                );

            } else {

                try {

                    await generateWordReport(
                        reportFolder,
                        evidenceData
                    );

                } catch (docxErr) {

                    console.log(
                        `⚠️  Word report failed: ${docxErr.message}`
                    );
                    console.log(
                        '   Falling back to text report…'
                    );

                    generateTextReport(
                        reportFolder,
                        evidenceData
                    );
                }
            }

        } else {

            console.log('⚠️  No evidence data collected');
        }

        // ── update data file ───────────────────────────

        if (currentFolderConfig && inputFile) {

            const storeKey =
                targetFolder || 'ROOT';

            await updateDataFile(
                inputFile,
                responseStore[storeKey] || [],
                resultStore[storeKey]   || [],
                currentFolderConfig
            );
        }

        // ── generate extent report ────────────────────

        const runEndTime = new Date();

        // Resolve attachment paths for Summary page.
        // Both files must be looked up inside reportFolder:
        //   - data file: copied there by updateDataFile() above
        //   - evidence file: written there by generateWordReport/generateTextReport above

        // Data file — find the copied version in reportFolder
        let summaryDataFile = null;
        try {
            const rfiles = fs.readdirSync(reportFolder);
            const df = rfiles.find(f => f.endsWith('.csv') || f.endsWith('.xlsx'));
            if (df) summaryDataFile = path.join(reportFolder, df);
        } catch {}

        // Fall back to original input file if copy not found
        if (!summaryDataFile && inputFile) {
            summaryDataFile = path.resolve(inputFile);
        }

        // Evidence file — written by generateWordReport/generateTextReport above
        let summaryEvidenceFile = null;
        try {
            const rfiles = fs.readdirSync(reportFolder);
            const ef = rfiles.find(f => f === 'ExecutionEvidence.docx' || f === 'ExecutionEvidence.txt');
            if (ef) summaryEvidenceFile = path.join(reportFolder, ef);
        } catch {}

        generateExtentReport(
            reportFolder,
            evidenceData,
            {
                collectionName:  liveCollection.info?.name || 'Newman Tests',
                folderName:      targetFolder || 'ROOT',
                startTime:       runStartTime,
                endTime:         runEndTime,
                totalDuration:   runEndTime - runStartTime,
                dataFilePath:    summaryDataFile,
                evidenceFile:    summaryEvidenceFile,
                evidenceFormat:  evidenceFormat
            }
        );

        console.log('\n🎉 Execution Completed');
        console.log(`📁 Extent Report:  ${reportFolder}/extent-report.html`);
        console.log(`📁 HTML Report:    ${reportFolder}/report.html`);
    });
}

// ======================================================
// UPDATE DATA FILE (CSV or XLSX)
// ======================================================

function updateDataFile(
    filePath,
    responseData,
    results,
    config
) {

    return new Promise(resolve => {

        // ── EXCEL ──────────────────────────────────────

        if (filePath.endsWith('.xlsx')) {

            const workbook =
                XLSX.readFile(filePath, { cellDates: true });

            const worksheetName =
                config.worksheet &&
                workbook.SheetNames.includes(config.worksheet)
                    ? config.worksheet
                    : workbook.SheetNames[0];

            const worksheet =
                workbook.Sheets[worksheetName];

            const rawData =
                XLSX.utils.sheet_to_json(
                    worksheet,
                    { defval: '', raw: true }
                );

            const jsonData = rawData.map(row => sanitizeRow(row));

            jsonData.forEach((row, i) => {

                row.testResult =
                    results[i] || '';

                if (responseData[i]) {
                    Object.keys(responseData[i]).forEach(key => {
                        row[key] = responseData[i][key];
                    });
                }
            });

            workbook.Sheets[worksheetName] =
                XLSX.utils.json_to_sheet(jsonData);

            XLSX.writeFile(workbook, filePath);

            console.log(`📘 Updated Excel: ${filePath}`);

            // copy to reports
            if (copyTestDataToReports) {

                const dest =
                    path.join(
                        reportFolder,
                        path.basename(filePath)
                    );

                fs.copyFileSync(filePath, dest);

                console.log(
                    `📂 Test data copied to reports: ${path.basename(filePath)}`
                );

            } else {

                console.log(
                    'ℹ️  Test data copy skipped (copyTestDataToReports=false)'
                );
            }

            resolve();

        // ── CSV ────────────────────────────────────────

        } else {

            fs.readFile(filePath, 'utf8', (err, data) => {

                if (err) {
                    console.log(`❌ Unable to read: ${filePath}`);
                    return resolve();
                }

                const parsed =
                    Papa.parse(data, {
                        header: true,
                        skipEmptyLines: true
                    });

                parsed.data.forEach((row, i) => {

                    row.testResult =
                        results[i] || '';

                    if (responseData[i]) {
                        Object.keys(responseData[i]).forEach(key => {
                            row[key] = responseData[i][key];
                        });
                    }
                });

                const updatedCsv =
                    Papa.unparse(parsed.data);

                fs.writeFileSync(filePath, updatedCsv);

                console.log(`📄 Updated CSV: ${filePath}`);

                // copy to reports
                if (copyTestDataToReports) {

                    const dest =
                        path.join(
                            reportFolder,
                            path.basename(filePath)
                        );

                    fs.copyFileSync(filePath, dest);

                    console.log(
                        `📂 Test data copied to reports: ${path.basename(filePath)}`
                    );

                } else {

                    console.log(
                        'ℹ️  Test data copy skipped (copyTestDataToReports=false)'
                    );
                }

                resolve();
            });
        }
    });
}

// ======================================================
// KICK OFF
// ======================================================

main().catch(err => {
    console.error(`\n❌ Fatal Error: ${err.message}`);
    process.exit(1);
});
