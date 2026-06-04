# Newman Automation Framework — Enhanced v2.0

## What's New

| Feature | How to configure |
|---|---|
| **Evidence format: DOCX or TXT** | `evidenceFormat=docx` or `evidenceFormat=txt` in `framework.properties` |
| **Copy test data to reports** | `copyTestDataToReports=true` or `false` |
| **Custom test case name column** | `testCaseNameColumn=yourColumnName` |
| **Multiple APIs per iteration** | Works automatically — all APIs in an iteration are captured |
| **Live Postman API fetch** | `collectionSource=postman` — no more manual JSON exports |

---

## Setup

```bash
npm install
```

---

## framework.properties — All Options

```properties
# ─── COLLECTION SOURCE ──────────────────────────────────
# 'file'    → load from local JSON (default)
# 'postman' → fetch live from Postman API (no export needed)
collectionSource=file

collection=./collection/new-collection.json

# Only needed when collectionSource=postman:
postmanApiKey=YOUR_POSTMAN_API_KEY_HERE
postmanCollectionId=YOUR_COLLECTION_UID_HERE

# ─── MAPPING ────────────────────────────────────────────
mappingType=json   # or yaml

# ─── EVIDENCE ───────────────────────────────────────────
# 'docx' → one Word page per iteration, all APIs on same page
# 'txt'  → single .txt file with all iterations
evidenceFormat=docx

# ─── TEST DATA ──────────────────────────────────────────
# Copy the CSV/Excel data file into the report folder?
copyTestDataToReports=true

# Column name in your data file that holds the test case name
testCaseNameColumn=testCaseName

# ─── SSL ────────────────────────────────────────────────
sslEnabled=false
sslCert=./certs/client-cert.pem
sslKey=./certs/client-key.pem
sslPassphrase=password123
```

---

## Running Tests

```bash
# Using runner.js (edit folderName / iterationCount inside the file)
npm test

# Or directly:
node runner.js
```

---

## Evidence Reports

### DOCX Format (`evidenceFormat=docx`)

Each **iteration** gets its own full page. If you have multiple APIs in one
iteration they all appear on the same page, separated by a divider:

```
┌──────────────────────────────────────────┐
│  API EXECUTION EVIDENCE                  │
│                                          │
│  TEST CASE NAME:  Happy path - new user  │
│  ITERATION:       0                      │
│  OVERALL RESULT:  PASSED                 │
│                                          │
│  ── API #1: Create_User ──               │
│  STATUS CODE:     200                    │
│  TEST RESULT:     PASSED                 │
│  REQUEST BODY:    { "name": "Gokul" }    │
│  RESPONSE BODY:   { "data": {...} }      │
│                                          │
│  ── API #2: Verify_User ──               │
│  STATUS CODE:     200                    │
│  TEST RESULT:     PASSED                 │
│  ...                                     │
└──────────────────────────────────────────┘
PAGE BREAK
┌──────────────────────────────────────────┐
│  (Iteration 1 on next page)              │
└──────────────────────────────────────────┘
```

### TXT Format (`evidenceFormat=txt`)

A **single `ExecutionEvidence.txt`** file with all iterations, each separated by
`=` dividers. All APIs per iteration appear in sequence.

---

## Live Postman API Fetch (No Export!)

Set in `framework.properties`:

```properties
collectionSource=postman
postmanApiKey=PMAK-xxxxxxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxx
postmanCollectionId=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

**Getting your API key:**
1. Open Postman → top-right avatar → Settings
2. Go to **API Keys** tab
3. Click **Generate API Key**

**Getting your Collection ID:**
1. In Postman, right-click your collection → **Info**
2. Copy the **ID** (looks like: `12345678-abcd-1234-efgh-...`)

Every `npm test` will fetch the **latest saved version** of your collection
directly from Postman — no JSON export step needed.

---

## Test Case Name Column

Add a column to your CSV/Excel (e.g. `testCaseName`) and set:

```properties
testCaseNameColumn=testCaseName
```

Example CSV:

```csv
testCaseName,name,email,age
"TC001 - Create valid user",Gokul,gokul@test.com,25
"TC002 - Create another user",Arun,arun@test.com,30
```

The test case name from each row appears in the evidence report for that
iteration.

---

## Report Structure

```
reports/
└── Create_User_2026-06-04T10-30-00-000Z/
    ├── report.html              ← HTML report (htmlextra)
    ├── ExecutionEvidence.docx   ← Word evidence (if evidenceFormat=docx)
    ├── ExecutionEvidence.txt    ← Text evidence  (if evidenceFormat=txt)
    ├── data.csv                 ← Test data copy (if copyTestDataToReports=true)
    └── evidence/
        ├── Creating_Users_iter0.txt
        ├── Creating_Users_iter1.txt
        └── ...
```
