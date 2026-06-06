# Newman Automation Framework v2

## Setup

```bash
npm install
```

---

## How It Works

Every `npm test` follows this exact sequence:

```
1. Load base collection   (collection path from framework.properties)
        ↓
2. Run "collection_json_api" folder silently
   → Response body saved as live-collection.json
   → NOT shown in HTML report
        ↓
3. Run target folder from live-collection.json
   → HTML report
   → Evidence (docx or txt)
   → Update CSV/Excel data file
   → Optionally copy data file to report folder
```

---

## Postman Setup — collection_json_api

You **must** have a folder named exactly **`collection_json_api`** in your
Postman collection. It should contain one GET request that calls the Postman
API and returns your collection JSON:

```
GET https://api.getpostman.com/collections/{{collectionId}}
Header: X-Api-Key: {{postmanApiKey}}
```

Set `collectionId` and `postmanApiKey` as Postman environment variables (or
hardcode them in the request). The response body is the live collection JSON —
the framework saves it and runs your tests from it. You never need to export
the collection JSON manually again.

The `collection_json_api` folder is excluded from the HTML report automatically.

---

## framework.properties

```properties
# Base collection JSON file (must contain collection_json_api folder)
collection=./collection/new-collection.json

# Where the live collection is saved before each run
collectionOutputPath=./collection/live-collection.json

# Mapping file format: json or yaml
mappingType=json

# Evidence format: docx or txt
evidenceFormat=docx

# Copy CSV/Excel data file to report folder after each run
copyTestDataToReports=true

# Column name in CSV/Excel that holds the test case name
testCaseNameColumn=testCaseName

# SSL (optional)
sslEnabled=false
sslCert=./certs/client-cert.pem
sslKey=./certs/client-key.pem
sslPassphrase=password123
```

---

## runner.js

```js
const folderName     = 'Create_User';  // Postman folder name, or null for ROOT
const iterationCount = null;           // null = all rows, number = first N rows
```

---

## folderMapping.json — Map Folders to Data Files

```json
{
  "Create_User": "./data/data.csv",
  "Orders_API": {
    "file": "./data/orders.xlsx",
    "worksheet": "Orders"
  }
}
```

Both CSV and Excel (with optional worksheet) are supported.

---

## csv_update.json — Extract Response Fields into Data File

```json
{
  "Creating_Users": {
    "host": "data.email"
  },
  "Get_User": {
    "userId": "data.id",
    "userName": "data.name"
  }
}
```

Each key is the **request name** in Postman. The value maps **column names** to
**JSON paths** in the response. Supports dot-paths and array indexing
(`data.orders[0].id`). Set a mapping to `null` to skip that API.

---

## Evidence Reports

### DOCX (`evidenceFormat=docx`)

One full Word page per iteration. Multiple APIs per iteration appear on the
same page separated by a divider. Page breaks between iterations.

```
┌─────────────────────────────────────────────┐
│  API EXECUTION EVIDENCE                      │
│  TEST CASE NAME:   TC001 - Create valid user │
│  ITERATION:        0                         │
│  OVERALL RESULT:   PASSED                    │
│                                              │
│  ── API #1: Creating_Users ──                │
│  STATUS CODE:      200                       │
│  TEST RESULT:      PASSED                    │
│  REQUEST BODY:     { "name": "Gokul" ... }   │
│  RESPONSE BODY:    { "data": { ... } }       │
└─────────────────────────────────────────────┘
         ← PAGE BREAK →
┌─────────────────────────────────────────────┐
│  (Iteration 1 here)                          │
└─────────────────────────────────────────────┘
```

### TXT (`evidenceFormat=txt`)

Single `ExecutionEvidence.txt` file containing all iterations.

---

## Test Case Name Column

Add a column (e.g. `testCaseName`) to your CSV/Excel:

```csv
testCaseName,name,email,age
"TC001 - Create valid user",Gokul,gokul@test.com,25
"TC002 - Create another user",Arun,arun@test.com,30
```

Set `testCaseNameColumn=testCaseName` in `framework.properties`.

---

## npm Scripts

```bash
npm test       # Run tests (uses runner.js)
npm run clear  # Delete all report folders
npm run convert  # Convert Excel files in csv-converter/ to csv files/
```

---

## Report Structure

```
reports/
└── Create_User_2026-06-04T10-30-00-000Z/
    ├── report.html              ← HTML report (collection_json_api excluded)
    ├── ExecutionEvidence.docx   ← Word evidence (evidenceFormat=docx)
    ├── ExecutionEvidence.txt    ← Text evidence  (evidenceFormat=txt)
    ├── data.csv                 ← Test data copy (copyTestDataToReports=true)
    └── evidence/
        ├── Creating_Users_iter0.txt
        ├── Creating_Users_iter1.txt
        └── ...

collection/
    ├── new-collection.json      ← Your base collection (commit this)
    └── live-collection.json     ← Auto-generated before each run (gitignore this)
```

---

## .gitignore Recommendation

```
node_modules/
reports/
collection/live-collection.json
```
