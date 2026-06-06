// ======================================================
// download-collection.js
//
// Downloads the latest collection JSON from Postman
// and saves it to collection/live-collection.json.
//
// TWO WAYS TO PROVIDE CREDENTIALS:
//
// 1. Hardcode below (local development / VS Code)
//    Set POSTMAN_API_KEY and POSTMAN_COLLECTION_ID
//    directly in this file.
//
// 2. Environment variables (GitHub Actions / CI)
//    Set POSTMAN_API_KEY and POSTMAN_COLLECTION_ID
//    as environment variables before running.
//    Values hardcoded below are used as fallback.
//
//    GitHub Actions injects them automatically from
//    repository secrets — nothing to change in this file.
//
// Usage:
//   node download-collection.js
// ======================================================

const https = require('https');
const fs    = require('fs');
const path  = require('path');

// ======================================================
// CREDENTIALS
// Environment variables take priority over hardcoded
// values — so this file works in both local and CI
// without any changes.
// ======================================================

const POSTMAN_API_KEY =
    process.env.POSTMAN_API_KEY ||
    'YOUR_POSTMAN_API_KEY_HERE';

// Get your API key:
// Postman → top-right avatar → Settings → API Keys → Generate API Key

const POSTMAN_COLLECTION_ID =
    process.env.POSTMAN_COLLECTION_ID ||
    'YOUR_COLLECTION_ID_HERE';

// Get your Collection ID:
// Postman → right-click your collection → Info → ID field

// ======================================================
// OUTPUT PATH
// ======================================================

const OUTPUT_PATH =
    './collection/live-collection.json';

// ======================================================
// VALIDATION
// ======================================================

if (
    !POSTMAN_API_KEY ||
    POSTMAN_API_KEY === 'YOUR_POSTMAN_API_KEY_HERE'
) {
    console.error(
        '\n❌  POSTMAN_API_KEY is not set.' +
        '\n    Either:' +
        '\n      • Set it in download-collection.js (local)' +
        '\n      • Or set the POSTMAN_API_KEY environment variable (CI)' +
        '\n    Get your key: https://go.postman.co/settings/me/api-keys\n'
    );
    process.exit(1);
}

if (
    !POSTMAN_COLLECTION_ID ||
    POSTMAN_COLLECTION_ID === 'YOUR_COLLECTION_ID_HERE'
) {
    console.error(
        '\n❌  POSTMAN_COLLECTION_ID is not set.' +
        '\n    Either:' +
        '\n      • Set it in download-collection.js (local)' +
        '\n      • Or set the POSTMAN_COLLECTION_ID environment variable (CI)' +
        '\n    Find it: right-click your collection in Postman → Info\n'
    );
    process.exit(1);
}

// ======================================================
// FETCH
// ======================================================

console.log(
    '\n📡 Connecting to Postman API...' +
    `\n   Collection ID: ${POSTMAN_COLLECTION_ID}\n`
);

const options = {
    hostname: 'api.getpostman.com',
    path:     `/collections/${POSTMAN_COLLECTION_ID}`,
    method:   'GET',
    headers: {
        'X-Api-Key': POSTMAN_API_KEY
    },
    timeout: 30000
};

const req = https.request(options, res => {

    let rawBody = '';

    res.on('data', chunk => {
        rawBody += chunk;
    });

    res.on('end', () => {

        // ── check HTTP status ──────────────────────────

        if (res.statusCode !== 200) {
            console.error(
                `\n❌  Postman API returned HTTP ${res.statusCode}.` +
                `\n    Response: ${rawBody.substring(0, 300)}` +
                '\n    Check your API key and collection ID.\n'
            );
            process.exit(1);
        }

        // ── parse ──────────────────────────────────────

        let parsed;

        try {
            parsed = JSON.parse(rawBody);
        } catch {
            console.error(
                '\n❌  Response from Postman API is not valid JSON.' +
                `\n    First 200 chars: ${rawBody.substring(0, 200)}\n`
            );
            process.exit(1);
        }

        // ── unwrap { collection: {...} } ───────────────

        if (parsed.collection) {
            parsed = parsed.collection;
        }

        // ── sanity check ───────────────────────────────

        if (!parsed.info || !parsed.item) {
            console.error(
                '\n❌  Response does not look like a Postman collection.' +
                `\n    Keys found: ${Object.keys(parsed).join(', ')}\n`
            );
            process.exit(1);
        }

        // ── ensure output folder exists ────────────────

        const outputDir =
            path.dirname(path.resolve(OUTPUT_PATH));

        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
            console.log(`📁 Created folder: ${outputDir}`);
        }

        // ── write file ─────────────────────────────────

        fs.writeFileSync(
            path.resolve(OUTPUT_PATH),
            JSON.stringify(parsed, null, 2),
            'utf8'
        );

        console.log(
            `✅ Collection downloaded successfully!` +
            `\n   Name:    "${parsed.info.name}"` +
            `\n   Folders: ${parsed.item.length}` +
            `\n   Saved to: ${OUTPUT_PATH}\n`
        );
    });
});

// ── timeout ────────────────────────────────────────────

req.on('timeout', () => {
    req.destroy();
    console.error(
        '\n❌  Request timed out after 30 seconds.' +
        '\n    Check your internet connection and try again.\n'
    );
    process.exit(1);
});

// ── network error ──────────────────────────────────────

req.on('error', err => {
    console.error(
        `\n❌  Network error: ${err.message}\n`
    );
    process.exit(1);
});

req.end();
