# GitHub Actions Setup Guide

## What gets committed vs what stays local

| File | Commit? | Why |
|------|---------|-----|
| `collection/new-collection.json` | ✅ Yes | Base collection for reference |
| `collection/live-collection.json` | ❌ No | Generated at runtime by download-collection.js |
| `config/framework.properties` | ✅ Yes | No secrets inside — cert paths are placeholders |
| `config/folderMapping.json` | ✅ Yes | |
| `config/csv_update.json` | ✅ Yes | |
| `data/*.csv` or `data/*.xlsx` | ✅ Yes | Test data |
| `download-collection.js` | ✅ Yes | Credentials come from env vars in CI |
| `runner.js` | ✅ Yes | Overwritten at runtime by the workflow |
| `.github/workflows/run-tests.yml` | ✅ Yes | |
| `certs/` | ❌ Never | Private keys — decode from secrets at runtime |
| `node_modules/` | ❌ No | Installed by npm install in CI |
| `reports/` | ❌ No | Generated at runtime, downloaded as artifact |

---

## One-time setup

### Step 1 — Add repository secrets

Go to your GitHub repo → **Settings** → **Secrets and variables**
→ **Actions** → **New repository secret**

#### Always required

| Secret name | Value | Where to find it |
|---|---|---|
| `POSTMAN_API_KEY` | Your Postman API key | Postman → avatar → Settings → API Keys → Generate API Key |
| `POSTMAN_COLLECTION_ID` | Your collection UID | Postman → right-click collection → Info → ID field |

#### Only needed when `sslEnabled=true` in framework.properties

| Secret name | Value |
|---|---|
| `SSL_CLIENT_CERT` | Base64-encoded content of `client-cert.pem` |
| `SSL_CLIENT_KEY` | Base64-encoded content of `client-key.pem` |
| `SSL_PASSPHRASE` | Your certificate passphrase as plain text |

**How to base64-encode your cert files:**

Mac / Linux:
```bash
base64 -i ./certs/client-cert.pem | pbcopy   # copies to clipboard
base64 -i ./certs/client-key.pem  | pbcopy
```

Windows (PowerShell):
```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes(".\certs\client-cert.pem")) | clip
[Convert]::ToBase64String([IO.File]::ReadAllBytes(".\certs\client-key.pem"))  | clip
```

Paste the output (one long string) as the secret value.

---

### Step 2 — Push your repo

Make sure all the files in the "Commit?" column above are pushed.
The `.gitignore` already excludes `certs/`, `node_modules/`,
`reports/`, and `collection/live-collection.json`.

---

## Running the workflow

1. Go to your GitHub repo → **Actions** tab
2. Click **Newman API Tests** in the left sidebar
3. Click **Run workflow** (top-right)
4. Fill in the two inputs:

| Input | Description | Example |
|---|---|---|
| `folder_name` | Exact Postman folder name to run | `Create_User` |
| `iteration_count` | Number of data rows | `3` or blank for all |

5. Click the green **Run workflow** button

---

## What each workflow step does

| Step | What happens |
|---|---|
| Checkout repository | Pulls your latest committed code |
| Set up Node.js 18 | Installs Node with npm cache |
| Install dependencies | Runs `npm install` |
| Restore SSL certificates | Decodes `SSL_CLIENT_CERT` and `SSL_CLIENT_KEY` secrets from base64 and writes them to `./certs/` — only runs when the secret is set. Files exist only for this job. |
| Set SSL passphrase | Patches `sslPassphrase=` in `framework.properties` with the `SSL_PASSPHRASE` secret value — only runs when the secret is set |
| Download latest collection | Runs `node download-collection.js` with `POSTMAN_API_KEY` and `POSTMAN_COLLECTION_ID` injected as env vars → saves `collection/live-collection.json` |
| Configure runner.js | Overwrites `runner.js` with your folder name and iteration count from the Run workflow dialog |
| Run Newman tests | Runs `npm test` |
| Upload test reports | Uploads `reports/` as a downloadable artifact (30-day retention) — runs even if tests fail |
| Write job summary | Adds a summary table to the Actions run page |

---

## Downloading reports after a run

1. Click on the completed workflow run
2. Scroll down to **Artifacts**
3. Click **test-reports-{run_number}** to download a ZIP

The ZIP contains:
```
reports/
└── Create_User_2026-06-06T.../
    ├── report.html              ← open in any browser
    ├── ExecutionEvidence.docx   ← or .txt depending on config
    ├── data.csv                 ← updated with test results
    └── evidence/
        ├── Creating_Users_iter0.txt
        └── ...
```

---

## SSL — local vs CI comparison

| | Local (VS Code) | GitHub Actions |
|---|---|---|
| Cert files | `./certs/` folder on your machine | Decoded from `SSL_CLIENT_CERT` / `SSL_CLIENT_KEY` secrets at runtime |
| Passphrase | Set in `framework.properties` | Injected from `SSL_PASSPHRASE` secret via `sed` at runtime |
| `framework.properties` cert paths | `./certs/client-cert.pem` | Same paths — certs are decoded to those exact paths |
| Anything committed | Nothing in `certs/` | Nothing — secrets never touch the repo |
