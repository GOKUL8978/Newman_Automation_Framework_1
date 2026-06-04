// ======================================
// scripts/run-tests.js
// ENHANCED VERSION
//
// New features:
// 1. Evidence format: docx or txt (from properties)
// 2. Copy test data to reports: true/false (from properties)
// 3. Test case name column: configurable (from properties)
// 4. Multiple APIs per iteration: all captured correctly
// 5. Postman API live fetch: no need to export collection JSON
// ======================================

const fs    = require('fs');
const path  = require('path');
const Papa  = require('papaparse');
const newman = require('newman');
const XLSX  = require('xlsx');
const yaml  = require('js-yaml');

const readProperties        = require('./properties-reader');
const fetchPostmanCollection = require('./postman-api-fetcher');
const generateWordReport    = require('./generate-word-report');
const generateTextReport    = require('./generate-text-report');

const {
    getValueFromPath,
    getFileConfig
} = require('./utils');

// ======================================
// LOAD FRAMEWORK CONFIG
// ======================================

const framework = readProperties('./config/framework.properties');

// ======================================
// READ NEW CONFIG OPTIONS
// ======================================

// Evidence format: 'docx' (default) or 'txt'
const evidenceFormat =
    (framework.evidenceFormat || 'docx').toLowerCase().trim();

// Copy test data file to reports: 'true' or 'false'
const copyTestDataToReports =
    (framework.copyTestDataToReports || 'true').toLowerCase().trim() === 'true';

// Test case name column in data file
const testCaseNameColumn =
    (framework.testCaseNameColumn || 'testCaseName').trim();

// Collection source: 'file' (default) or 'postman'
const collectionSource =
    (framework.collectionSource || 'file').toLowerCase().trim();

console.log(`\n📋 Evidence Format:         ${evidenceFormat.toUpperCase()}`);
console.log(`📂 Copy Test Data:          ${copyTestDataToReports}`);
console.log(`🏷️  Test Case Name Column:  ${testCaseNameColumn}`);
console.log(`🌐 Collection Source:       ${collectionSource}`);

// ======================================
// INPUTS
// ======================================

const targetFolder   = process.argv[2];
const iterationCount = process.argv[3];

// ======================================
// LOAD MAPPING FILES
// ======================================

const folderFile =
    framework.mappingType === 'yaml'
        ? './config/folderMapping.yaml'
        : './config/folderMapping.json';

const mappingFile =
    framework.mappingType === 'yaml'
        ? './config/mapping.yaml'
        : './config/mapping.json';

let apiFieldMapping = {};
let folderCsvMap = {};

// Load API field mapping (optional - ok if missing)
try {
    apiFieldMapping =
        framework.mappingType === 'yaml'
            ? yaml.load(fs.readFileSync(mappingFile, 'utf8'))
            : require(path.resolve(mappingFile));
} catch {
    console.log('ℹ️  No API field mapping file found — skipping field extraction');
}

// Load folder mapping
try {
    folderCsvMap =
        framework.mappingType === 'yaml'
            ? yaml.load(fs.readFileSync(folderFile, 'utf8'))
            : require(path.resolve(folderFile));
} catch {
    console.log('ℹ️  No folder mapping file found — running without data file');
}

// ======================================
// STORES
// ======================================

// responseStore[iteration] = [ { apiName, statusCode, requestBody, responseBody }, ... ]
let iterationApiStore = {};

// resultStore[iteration] = { [apiName]: 'PASSED' | 'FAILED' }
let iterationResultStore = {};

// Raw data rows (for test case name lookup)
let iterationDataRows = [];

// ======================================
// REPORT FOLDER
// ======================================

const timestamp =
    new Date().toISOString().replace(/[:.]/g, '-');

const reportFolder =
    `./reports/${targetFolder || 'ROOT'}_${timestamp}`;

const evidenceFolder =
    `${reportFolder}/evidence`;

fs.mkdirSync(evidenceFolder, { recursive: true });

// ======================================
// INPUT FILE CONFIG
// ======================================

let currentFolderConfig = null;

if (targetFolder && folderCsvMap[targetFolder]) {
    currentFolderConfig = getFileConfig(folderCsvMap, targetFolder);
} else if (folderCsvMap['ROOT']) {
    currentFolderConfig = getFileConfig(folderCsvMap, 'ROOT');
}

let inputFile = currentFolderConfig?.file || null;

// ======================================
// READ EXCEL DATA
// ======================================

function readExcelData(excelPath, worksheetName) {

    const workbook = XLSX.readFile(excelPath);

    if (!worksheetName || !workbook.SheetNames.includes(worksheetName)) {
        worksheetName = workbook.SheetNames[0];
        console.log(`📄 Using first worksheet: ${worksheetName}`);
    } else {
        console.log(`📄 Using worksheet: ${worksheetName}`);
    }

    const worksheet = workbook.Sheets[worksheetName];

    return XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: false });
}

// ======================================
// MAIN RUN (async to support Postman API fetch)
// ======================================

async function main() {

    // ======================================
    // LOAD COLLECTION
    // ======================================

    let collection;

    if (collectionSource === 'postman') {

        collection = await fetchPostmanCollection(
            framework.postmanApiKey,
            framework.postmanCollectionId
        );

    } else {

        const collectionPath = framework.collection;

        if (!collectionPath) {
            console.log('❌ Collection path missing in framework.properties');
            process.exit(1);
        }

        collection = require(path.resolve(collectionPath));
        console.log(`📦 Loaded collection from file: ${collectionPath}`);
    }

    // ======================================
    // BUILD REQUEST → FOLDER MAP
    // ======================================

    function buildRequestFolderMap(items, currentFolder = null, map = {}) {
        if (!Array.isArray(items)) return map;
        items.forEach(item => {
            if (item.item) {
                buildRequestFolderMap(item.item, item.name, map);
            } else {
                map[item.name] = currentFolder || 'ROOT';
            }
        });
        return map;
    }

    const requestFolderMap = buildRequestFolderMap(collection.item);

    // ======================================
    // NEWMAN OPTIONS
    // ======================================

    const newmanOptions = {
        collection,
        reporters: ['cli', 'htmlextra'],
        reporter: {
            htmlextra: {
                export:       `${reportFolder}/report.html`,
                title:        `${targetFolder || 'ROOT'} Report`,
                showIterationData: true,
                logs:         true,
                browserTitle: 'Automation Report'
            }
        },
        timeout:       0,
        timeoutRequest: 0,
        timeoutScript: 0
    };

    // Iteration count
    if (
        iterationCount !== undefined &&
        iterationCount !== null &&
        iterationCount !== '' &&
        !isNaN(iterationCount)
    ) {
        newmanOptions.iterationCount = Number(iterationCount);
        console.log(`🔁 Running ${iterationCount} iterations`);
    } else {
        console.log('🔁 Running ALL iterations');
    }

    // Folder filter
    if (targetFolder) {
        newmanOptions.folder = targetFolder;
    }

    // Input data
    if (inputFile) {
        if (inputFile.endsWith('.xlsx')) {
            const worksheet = currentFolderConfig?.worksheet;
            const rows = readExcelData(inputFile, worksheet);
            iterationDataRows = rows;
            newmanOptions.iterationData = rows;
            console.log(`📘 Using Excel File: ${inputFile}`);
        } else {
            // CSV — pre-read rows for testCaseName lookup
            try {
                const csvContent = fs.readFileSync(inputFile, 'utf8');
                const parsed = Papa.parse(csvContent, {
                    header: true,
                    skipEmptyLines: true
                });
                iterationDataRows = parsed.data;
            } catch {
                iterationDataRows = [];
            }
            newmanOptions.iterationData = inputFile;
            console.log(`📄 Using CSV File: ${inputFile}`);
        }
    } else {
        console.log('ℹ️  Running without data file');
    }

    // SSL
    if (framework.sslEnabled === 'true') {
        console.log('🔐 SSL Enabled');
        newmanOptions.sslClientCert     = fs.readFileSync(framework.sslCert);
        newmanOptions.sslClientKey      = fs.readFileSync(framework.sslKey);
        newmanOptions.sslClientPassphrase = framework.sslPassphrase;
    }

    // ======================================
    // RUN NEWMAN
    // ======================================

    newman.run(newmanOptions)

    // ======================================
    // REQUEST EVENT — capture per API per iteration
    // ======================================

    .on('request', (err, args) => {

        if (err) return;

        const requestName = args.item.name;
        const folderName  = requestFolderMap[requestName] || 'ROOT';

        // Skip if not in target folder
        if (
            targetFolder &&
            folderName !== targetFolder &&
            requestName !== targetFolder
        ) return;

        const iteration    = args.cursor.iteration;
        const requestBody  = args.request.body?.raw || '';
        const responseBody = args.response.stream.toString();
        const statusCode   = args.response.code;

        console.log('\n================================');
        console.log(`API: ${requestName}`);
        console.log(`Iteration: ${iteration}`);
        console.log(`Status Code: ${statusCode}`);
        console.log('\nREQUEST BODY:\n');
        console.log(requestBody);
        console.log('\nRESPONSE BODY:\n');
        console.log(responseBody);
        console.log('\n================================');

        // Write individual evidence file (raw backup)
        const evidenceFile = `${evidenceFolder}/${requestName}_iter${iteration}.txt`;
        fs.writeFileSync(
            evidenceFile,
`REQUEST BODY:

${requestBody}

==================================================

RESPONSE BODY:

${responseBody}
`
        );

        // Collect into iteration store
        if (!iterationApiStore[iteration]) {
            iterationApiStore[iteration] = [];
        }

        iterationApiStore[iteration].push({
            apiName:      requestName,
            statusCode:   statusCode,
            requestBody:  requestBody,
            responseBody: responseBody,
            result:       null  // filled in 'done'
        });

        // Also store CSV update fields (response field mapping)
        try {
            const res = JSON.parse(responseBody);
            const storeKey = targetFolder === requestName ? targetFolder : folderName;

            // We keep the old responseStore logic for CSV/Excel update
            if (!global._responseStore) global._responseStore = {};
            if (!global._responseStore[storeKey]) global._responseStore[storeKey] = [];
            if (!global._responseStore[storeKey][iteration]) {
                global._responseStore[storeKey][iteration] = {};
            }

            global._responseStore[storeKey][iteration].requestBody  = requestBody;
            global._responseStore[storeKey][iteration].responseBody = responseBody;
            global._responseStore[storeKey][iteration].responseStatusCode = statusCode;

            const mapping = apiFieldMapping[requestName];
            if (mapping) {
                Object.keys(mapping).forEach(col => {
                    global._responseStore[storeKey][iteration][col] =
                        getValueFromPath(res, mapping[col]);
                });
            }
        } catch {
            console.log(`⚠️  Non-JSON response for: ${requestName}`);
        }
    })

    // ======================================
    // DONE EVENT — finalize results + generate reports
    // ======================================

    .on('done', async (err, summary) => {

        if (err) {
            console.log(err);
            process.exit(1);
        }

        // ======================================
        // COLLECT PASS/FAIL PER API PER ITERATION
        // ======================================

        summary.run.executions.forEach(exec => {

            const requestName = exec.item.name;
            const folderName  = requestFolderMap[requestName] || 'ROOT';

            if (
                targetFolder &&
                folderName !== targetFolder &&
                requestName !== targetFolder
            ) return;

            const i      = exec.cursor.iteration;
            const passed = exec.assertions?.every(a => !a.error) ?? true;
            const result = passed ? 'PASSED' : 'FAILED';

            // Mark result in iterationApiStore
            if (iterationApiStore[i]) {
                const apiEntry = iterationApiStore[i].find(
                    a => a.apiName === requestName
                );
                if (apiEntry) apiEntry.result = result;
            }

            // For CSV/Excel update
            const storeKey = targetFolder === requestName ? targetFolder : folderName;
            if (!global._resultStore) global._resultStore = {};
            if (!global._resultStore[storeKey]) global._resultStore[storeKey] = [];
            global._resultStore[storeKey][i] = result;
        });

        // ======================================
        // ASSEMBLE EVIDENCE DATA
        // Grouped by iteration, all APIs per iteration
        // ======================================

        const evidenceData = [];

        const iterations = Object.keys(iterationApiStore)
            .map(Number)
            .sort((a, b) => a - b);

        iterations.forEach(iter => {

            const testCaseName =
                iterationDataRows[iter]
                    ? (iterationDataRows[iter][testCaseNameColumn] || `Iteration ${iter}`)
                    : `Iteration ${iter}`;

            // Ensure all APIs have a result
            const apis = iterationApiStore[iter].map(api => ({
                ...api,
                result: api.result || 'UNKNOWN'
            }));

            evidenceData.push({
                iteration:    iter,
                testCaseName,
                apis
            });
        });

        // ======================================
        // GENERATE EVIDENCE REPORT
        // ======================================

        if (evidenceData.length > 0) {

            if (evidenceFormat === 'txt') {

                generateTextReport(reportFolder, evidenceData);

            } else {

                // Default: docx
                try {
                    await generateWordReport(reportFolder, evidenceData);
                } catch (docxErr) {
                    console.log(`⚠️  Word report failed: ${docxErr.message}`);
                    console.log('   Falling back to text report...');
                    generateTextReport(reportFolder, evidenceData);
                }
            }

        } else {
            console.log('⚠️  No evidence data collected');
        }

        // ======================================
        // UPDATE DATA FILE (CSV/Excel)
        // ======================================

        if (currentFolderConfig && inputFile) {

            const responseStore = global._responseStore || {};
            const resultStore   = global._resultStore   || {};
            const storeKey      = targetFolder || 'ROOT';

            await updateDataFile(
                inputFile,
                responseStore[storeKey] || [],
                resultStore[storeKey]   || [],
                currentFolderConfig
            );
        }

        console.log('\n🎉 Execution Completed');
    });
}

// ======================================
// UPDATE DATA FILE (CSV or XLSX)
// ======================================

function updateDataFile(filePath, responseData, results, config) {

    return new Promise(resolve => {

        if (filePath.endsWith('.xlsx')) {

            const workbook = XLSX.readFile(filePath);

            const worksheetName =
                config.worksheet && workbook.SheetNames.includes(config.worksheet)
                    ? config.worksheet
                    : workbook.SheetNames[0];

            const worksheet = workbook.Sheets[worksheetName];

            const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: false });

            jsonData.forEach((row, i) => {
                row.testResult = results[i] || '';
                if (responseData[i]) {
                    Object.keys(responseData[i]).forEach(key => {
                        row[key] = responseData[i][key];
                    });
                }
            });

            workbook.Sheets[worksheetName] = XLSX.utils.json_to_sheet(jsonData);

            XLSX.writeFile(workbook, filePath);

            console.log(`📘 Updated Excel: ${filePath}`);

            // Copy to reports if enabled
            if (copyTestDataToReports) {
                const dest = path.join(reportFolder, path.basename(filePath));
                fs.copyFileSync(filePath, dest);
                console.log(`📂 Test data copied to reports: ${dest}`);
            }

            resolve();

        } else {

            fs.readFile(filePath, 'utf8', (err, data) => {

                if (err) {
                    console.log(`❌ Unable to read: ${filePath}`);
                    return resolve();
                }

                const parsed = Papa.parse(data, {
                    header: true,
                    skipEmptyLines: true
                });

                parsed.data.forEach((row, i) => {
                    row.testResult = results[i] || '';
                    if (responseData[i]) {
                        Object.keys(responseData[i]).forEach(key => {
                            row[key] = responseData[i][key];
                        });
                    }
                });

                const updatedCsv = Papa.unparse(parsed.data);
                fs.writeFileSync(filePath, updatedCsv);
                console.log(`📄 Updated CSV: ${filePath}`);

                // Copy to reports if enabled
                if (copyTestDataToReports) {
                    const dest = path.join(reportFolder, path.basename(filePath));
                    fs.copyFileSync(filePath, dest);
                    console.log(`📂 Test data copied to reports: ${dest}`);
                } else {
                    console.log('ℹ️  Test data copy skipped (copyTestDataToReports=false)');
                }

                resolve();
            });

            return;
        }
    });
}

// ======================================
// KICK OFF
// ======================================

main().catch(err => {
    console.error(`❌ Fatal Error: ${err.message}`);
    process.exit(1);
});
