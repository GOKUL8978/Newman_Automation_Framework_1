// ======================================================
// scripts/fetch-live-collection.js
//
// Fetches the latest collection JSON directly from the
// Postman REST API using Node's built-in https module.
//
// WHY NOT NEWMAN HERE?
// -------------------
// Running the collection_json_api folder through Newman
// requires Postman environment variables ({{postmanApiKey}}
// and {{collectionId}}) to be resolved at runtime.
// Newman has no environment passed during this pre-step,
// so those variables stay unresolved → the URL becomes
// "https://api.getpostman.com/collections/{{collectionId}}"
// → the request hangs or times out.
//
// The fix: call the Postman API directly from Node using
// the values from framework.properties. No Newman, no
// variable resolution issues, no timeouts.
//
// The saved live-collection.json is then loaded by the
// main newman.run() for the actual test execution.
// ======================================================

const fs    = require('fs');
const path  = require('path');
const https = require('https');

/**
 * Fetches the latest collection JSON from the Postman API
 * and writes it to outputPath.
 *
 * @param {string} apiKey          - Postman API key (from framework.properties)
 * @param {string} collectionId    - Postman collection UID (from framework.properties)
 * @param {string} outputPath      - File path to write the live collection JSON
 * @returns {Promise<void>}
 */
function fetchLiveCollection(
    apiKey,
    collectionId,
    outputPath
) {

    return new Promise((resolve, reject) => {

        // ── validate inputs ────────────────────────────

        if (
            !apiKey ||
            apiKey.trim() === '' ||
            apiKey === 'YOUR_POSTMAN_API_KEY_HERE'
        ) {
            return reject(new Error(
                '❌  postmanApiKey is not set in framework.properties.\n' +
                '    Get your key: https://go.postman.co/settings/me/api-keys'
            ));
        }

        if (
            !collectionId ||
            collectionId.trim() === '' ||
            collectionId === 'YOUR_COLLECTION_ID_HERE'
        ) {
            return reject(new Error(
                '❌  postmanCollectionId is not set in framework.properties.\n' +
                '    Find it: right-click your collection in Postman → Info'
            ));
        }

        console.log(
            `\n🔄 Fetching latest collection from Postman API…\n` +
            `   Collection ID: ${collectionId}`
        );

        // ── make the HTTPS request ─────────────────────

        const options = {
            hostname: 'api.getpostman.com',
            path:     `/collections/${collectionId.trim()}`,
            method:   'GET',
            headers: {
                'X-Api-Key': apiKey.trim()
            },
            // Explicit socket timeout — prevents silent hangs
            timeout: 30000
        };

        const req = https.request(options, res => {

            let rawBody = '';

            res.on('data', chunk => {
                rawBody += chunk;
            });

            res.on('end', () => {

                // ── check HTTP status ──────────────────

                if (res.statusCode !== 200) {
                    return reject(new Error(
                        `❌  Postman API returned HTTP ${res.statusCode}.\n` +
                        `    Response: ${rawBody.substring(0, 300)}\n` +
                        `    Check your postmanApiKey and postmanCollectionId.`
                    ));
                }

                // ── parse JSON ─────────────────────────

                let parsed;

                try {
                    parsed = JSON.parse(rawBody);
                } catch (parseErr) {
                    return reject(new Error(
                        `❌  Postman API response is not valid JSON.\n` +
                        `    First 200 chars: ${rawBody.substring(0, 200)}`
                    ));
                }

                // ── unwrap { collection: {...} } ───────
                // Postman API wraps the collection under
                // a "collection" key.

                if (parsed.collection) {
                    parsed = parsed.collection;
                }

                // ── sanity check ───────────────────────

                if (!parsed.info || !parsed.item) {
                    return reject(new Error(
                        `❌  Postman API response does not look like a collection\n` +
                        `    (missing "info" or "item" keys).\n` +
                        `    Got keys: ${Object.keys(parsed).join(', ')}`
                    ));
                }

                // ── write to disk ──────────────────────

                const outputDir =
                    path.dirname(path.resolve(outputPath));

                if (!fs.existsSync(outputDir)) {
                    fs.mkdirSync(outputDir, { recursive: true });
                }

                fs.writeFileSync(
                    path.resolve(outputPath),
                    JSON.stringify(parsed, null, 2),
                    'utf8'
                );

                console.log(
                    `✅ Live collection saved to: ${outputPath}\n` +
                    `   Name:    "${parsed.info.name}"\n` +
                    `   Folders: ${parsed.item.length}`
                );

                resolve();
            });
        });

        // ── socket timeout handler ─────────────────────
        // Fires when the socket is idle for 30 s.
        // Without this, a silent network issue can hang
        // the process indefinitely.

        req.on('timeout', () => {
            req.destroy();
            reject(new Error(
                '❌  Request to Postman API timed out after 30 s.\n' +
                '    Check your internet connection and try again.'
            ));
        });

        // ── network error handler ──────────────────────

        req.on('error', err => {
            reject(new Error(
                `❌  Network error calling Postman API: ${err.message}`
            ));
        });

        req.end();
    });
}

module.exports = fetchLiveCollection;
