// ======================================
// scripts/postman-api-fetcher.js
//
// Fetches a Postman collection live from
// the Postman API — no export required.
//
// Requires:
//   postmanApiKey    - from framework.properties
//   postmanCollectionId - from framework.properties
// ======================================

const https = require('https');

/**
 * Fetches a Postman collection from the Postman API.
 *
 * @param {string} apiKey         - Your Postman API key
 * @param {string} collectionId   - The Postman collection UID
 * @returns {Promise<object>}     - Resolves to the collection JSON object
 */
function fetchPostmanCollection(apiKey, collectionId) {

    return new Promise((resolve, reject) => {

        if (!apiKey || apiKey === 'YOUR_POSTMAN_API_KEY_HERE') {
            return reject(
                new Error(
                    '❌ postmanApiKey is not set in framework.properties.\n' +
                    '   Get your key from: https://go.postman.co/settings/me/api-keys'
                )
            );
        }

        if (!collectionId || collectionId === 'YOUR_COLLECTION_ID_HERE') {
            return reject(
                new Error(
                    '❌ postmanCollectionId is not set in framework.properties.\n' +
                    '   Find your collection ID in Postman → right-click collection → Info.'
                )
            );
        }

        const options = {
            hostname: 'api.getpostman.com',
            path: `/collections/${collectionId}`,
            method: 'GET',
            headers: {
                'X-Api-Key': apiKey
            }
        };

        console.log(`🌐 Fetching collection from Postman API (ID: ${collectionId})...`);

        const req = https.request(options, res => {

            let body = '';

            res.on('data', chunk => {
                body += chunk;
            });

            res.on('end', () => {

                if (res.statusCode !== 200) {
                    return reject(
                        new Error(
                            `❌ Postman API returned HTTP ${res.statusCode}.\n` +
                            `   Response: ${body}\n` +
                            `   Check your API key and collection ID.`
                        )
                    );
                }

                try {

                    const parsed = JSON.parse(body);

                    if (!parsed.collection) {
                        return reject(
                            new Error(
                                `❌ Unexpected Postman API response format.\n` +
                                `   Body: ${body.substring(0, 300)}`
                            )
                        );
                    }

                    console.log(
                        `✅ Collection fetched: "${parsed.collection.info.name}"`
                    );

                    resolve(parsed.collection);

                } catch (parseErr) {
                    reject(
                        new Error(
                            `❌ Failed to parse Postman API response: ${parseErr.message}`
                        )
                    );
                }
            });
        });

        req.on('error', err => {
            reject(
                new Error(
                    `❌ Network error fetching from Postman API: ${err.message}`
                )
            );
        });

        req.end();
    });
}

module.exports = fetchPostmanCollection;
