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
// CORPORATE PROXY:
//   Node.js https bypasses the system proxy that
//   Postman and browsers use automatically.
//   This script auto-detects your proxy from the
//   standard environment variables and tunnels
//   through it — no extra npm packages needed.
//
//   If your proxy is not picked up automatically,
//   set it explicitly below in PROXY_HOST / PROXY_PORT
//   or export it before running:
//
//     Windows CMD  : set HTTPS_PROXY=http://proxy.corp.com:8080
//     Windows PS   : $env:HTTPS_PROXY="http://proxy.corp.com:8080"
//     Mac / Linux  : export HTTPS_PROXY=http://proxy.corp.com:8080
//
// Usage:
//   node download-collection.js
// ======================================================

const https = require('https');
const http  = require('http');
const net   = require('net');
const fs    = require('fs');
const path  = require('path');
const url   = require('url');

// ======================================================
// CREDENTIALS
// ======================================================

const POSTMAN_API_KEY =
    process.env.POSTMAN_API_KEY ||
    'YOUR_POSTMAN_API_KEY_HERE';

const POSTMAN_COLLECTION_ID =
    process.env.POSTMAN_COLLECTION_ID ||
    'YOUR_COLLECTION_ID_HERE';

// ======================================================
// PROXY — explicit override (optional)
//
// Leave both empty to auto-detect from env vars.
// Set these only if auto-detection does not work.
//
// Examples:
//   PROXY_HOST = 'proxy.corp.com'
//   PROXY_PORT = 8080
// ======================================================

const PROXY_HOST = '';
const PROXY_PORT = 0;

// ======================================================
// OUTPUT PATH
// ======================================================

const OUTPUT_PATH = './collection/live-collection.json';

// ======================================================
// VALIDATION
// ======================================================

if (!POSTMAN_API_KEY || POSTMAN_API_KEY === 'YOUR_POSTMAN_API_KEY_HERE') {
    console.error(
        '\n❌  POSTMAN_API_KEY is not set.' +
        '\n    Either:' +
        '\n      • Set it in download-collection.js (local)' +
        '\n      • Or set the POSTMAN_API_KEY environment variable (CI)' +
        '\n    Get your key: https://go.postman.co/settings/me/api-keys\n'
    );
    process.exit(1);
}

if (!POSTMAN_COLLECTION_ID || POSTMAN_COLLECTION_ID === 'YOUR_COLLECTION_ID_HERE') {
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
// PROXY DETECTION
//
// Priority order:
//   1. PROXY_HOST / PROXY_PORT hardcoded above
//   2. HTTPS_PROXY environment variable
//   3. https_proxy environment variable (Linux lowercase)
//   4. HTTP_PROXY environment variable
//   5. http_proxy environment variable
//   6. No proxy — direct connection
// ======================================================

function detectProxy() {

    // explicit override takes highest priority
    if (PROXY_HOST && PROXY_PORT) {
        return { host: PROXY_HOST, port: PROXY_PORT };
    }

    const raw =
        process.env.HTTPS_PROXY ||
        process.env.https_proxy ||
        process.env.HTTP_PROXY  ||
        process.env.http_proxy  ||
        '';

    if (!raw) return null;

    try {
        const parsed = new url.URL(
            raw.startsWith('http') ? raw : 'http://' + raw
        );
        return {
            host: parsed.hostname,
            port: parseInt(parsed.port, 10) || 8080
        };
    } catch {
        console.warn(`⚠️  Could not parse proxy URL: ${raw} — trying direct`);
        return null;
    }
}

const proxy = detectProxy();

if (proxy) {
    console.log(
        `\n🔀 Corporate proxy detected: ${proxy.host}:${proxy.port}` +
        '\n   Tunnelling request through proxy...'
    );
} else {
    console.log('\n🔗 No proxy detected — using direct connection');
}

// ======================================================
// FETCH — with or without proxy tunnel
// ======================================================

console.log(
    '\n📡 Connecting to Postman API...' +
    `\n   Collection ID: ${POSTMAN_COLLECTION_ID}\n`
);

const TARGET_HOST = 'api.getpostman.com';
const TARGET_PORT = 443;
const API_PATH    = `/collections/${POSTMAN_COLLECTION_ID}`;

function onResponse(res) {

    let rawBody = '';

    res.on('data', chunk => { rawBody += chunk; });

    res.on('end', () => {

        if (res.statusCode !== 200) {
            console.error(
                `\n❌  Postman API returned HTTP ${res.statusCode}.` +
                `\n    Response: ${rawBody.substring(0, 300)}` +
                '\n    Check your API key and collection ID.\n'
            );
            process.exit(1);
        }

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

        // unwrap { collection: {...} }
        if (parsed.collection) {
            parsed = parsed.collection;
        }

        if (!parsed.info || !parsed.item) {
            console.error(
                '\n❌  Response does not look like a Postman collection.' +
                `\n    Keys found: ${Object.keys(parsed).join(', ')}\n`
            );
            process.exit(1);
        }

        const outputDir = path.dirname(path.resolve(OUTPUT_PATH));
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        fs.writeFileSync(
            path.resolve(OUTPUT_PATH),
            JSON.stringify(parsed, null, 2),
            'utf8'
        );

        console.log(
            '✅ Collection downloaded successfully!' +
            `\n   Name:    "${parsed.info.name}"` +
            `\n   Folders: ${parsed.item.length}` +
            `\n   Saved to: ${OUTPUT_PATH}\n`
        );
    });
}

function onError(err) {
    console.error(`\n❌  Network error: ${err.message}`);

    if (
        err.message.includes('ECONNREFUSED') ||
        err.message.includes('ECONNRESET') ||
        err.message.includes('ETIMEDOUT')
    ) {
        console.error(
            '\n💡  This looks like a corporate proxy / firewall issue.' +
            '\n    Try one of these:' +
            '\n' +
            '\n    1. Set your proxy in download-collection.js:' +
            '\n       PROXY_HOST = \'proxy.corp.com\'' +
            '\n       PROXY_PORT = 8080' +
            '\n' +
            '\n    2. Or export before running:' +
            '\n       Windows CMD : set HTTPS_PROXY=http://proxy.corp.com:8080' +
            '\n       Windows PS  : $env:HTTPS_PROXY="http://proxy.corp.com:8080"' +
            '\n       Mac/Linux   : export HTTPS_PROXY=http://proxy.corp.com:8080' +
            '\n' +
            '\n    3. Ask your network team for the proxy address and port.\n'
        );
    }

    process.exit(1);
}

// ── DIRECT CONNECTION (no proxy) ──────────────────────

function fetchDirect() {

    const options = {
        hostname: TARGET_HOST,
        port:     TARGET_PORT,
        path:     API_PATH,
        method:   'GET',
        headers:  { 'X-Api-Key': POSTMAN_API_KEY },
        timeout:  30000
    };

    const req = https.request(options, onResponse);

    req.on('timeout', () => {
        req.destroy();
        console.error(
            '\n❌  Request timed out after 30 seconds.' +
            '\n    If you are on a corporate network, set your proxy:' +
            '\n    PROXY_HOST = \'proxy.corp.com\' in download-collection.js\n'
        );
        process.exit(1);
    });

    req.on('error', onError);
    req.end();
}

// ── PROXY TUNNEL (CONNECT method) ─────────────────────
//
// How it works:
//   1. Open a plain TCP connection to the proxy server
//   2. Send HTTP CONNECT to ask the proxy to open a
//      tunnel to api.getpostman.com:443
//   3. Once the proxy replies "200 Connection established"
//      wrap that socket in TLS (the actual HTTPS layer)
//   4. Send the real GET request over the TLS socket
//
// This is exactly what every browser and Postman does
// behind the scenes when going through a proxy.

function fetchViaProxy(proxyHost, proxyPort) {

    // Step 1 — TCP connect to proxy
    const socket = net.createConnection(proxyPort, proxyHost, () => {

        // Step 2 — send CONNECT tunnel request
        socket.write(
            `CONNECT ${TARGET_HOST}:${TARGET_PORT} HTTP/1.1\r\n` +
            `Host: ${TARGET_HOST}:${TARGET_PORT}\r\n` +
            `Connection: keep-alive\r\n` +
            `\r\n`
        );
    });

    socket.setTimeout(30000);

    socket.on('timeout', () => {
        socket.destroy();
        console.error(
            '\n❌  Proxy tunnel timed out after 30 seconds.' +
            `\n    Proxy: ${proxyHost}:${proxyPort}` +
            '\n    Check the proxy address and port are correct.\n'
        );
        process.exit(1);
    });

    socket.on('error', onError);

    // Step 3 — wait for proxy "200 Connection established"
    let proxyResponse = '';

    socket.on('data', chunk => {

        proxyResponse += chunk.toString();

        // Proxy response ends with blank line \r\n\r\n
        if (!proxyResponse.includes('\r\n\r\n')) return;

        const statusLine = proxyResponse.split('\r\n')[0];

        if (!statusLine.includes('200')) {
            console.error(
                '\n❌  Proxy refused the tunnel.' +
                `\n    Proxy response: ${statusLine}` +
                '\n    Check that the proxy allows access to api.getpostman.com\n'
            );
            process.exit(1);
        }

        // Remove this data listener — socket now belongs to TLS
        socket.removeAllListeners('data');
        socket.setTimeout(0);

        // Step 4 — upgrade socket to TLS and send real request
        const tlsSocket = require('tls').connect(
            {
                socket:            socket,
                host:              TARGET_HOST,
                servername:        TARGET_HOST,
                rejectUnauthorized: true
            },
            () => {

                // TLS handshake done — send the real GET request
                tlsSocket.write(
                    `GET ${API_PATH} HTTP/1.1\r\n` +
                    `Host: ${TARGET_HOST}\r\n` +
                    `X-Api-Key: ${POSTMAN_API_KEY}\r\n` +
                    `Connection: close\r\n` +
                    `\r\n`
                );
            }
        );

        tlsSocket.setTimeout(30000);

        tlsSocket.on('timeout', () => {
            tlsSocket.destroy();
            console.error('\n❌  TLS connection timed out.\n');
            process.exit(1);
        });

        tlsSocket.on('error', onError);

        // Parse the raw HTTP response from the TLS socket
        let rawResponse = '';

        tlsSocket.on('data', d => { rawResponse += d.toString(); });

        tlsSocket.on('end', () => {

            // Split headers from body
            const splitIdx = rawResponse.indexOf('\r\n\r\n');

            if (splitIdx === -1) {
                console.error('\n❌  Malformed HTTP response from Postman API.\n');
                process.exit(1);
            }

            const headerSection = rawResponse.substring(0, splitIdx);
            let   body          = rawResponse.substring(splitIdx + 4);

            // Extract status code from first line: "HTTP/1.1 200 OK"
            const statusMatch = headerSection.match(/HTTP\/[\d.]+\s+(\d+)/);
            const statusCode  = statusMatch ? parseInt(statusMatch[1], 10) : 0;

            // Handle chunked transfer encoding
            if (headerSection.toLowerCase().includes('transfer-encoding: chunked')) {
                body = unchunk(body);
            }

            // Feed into the shared response handler via a fake res object
            const fakeRes = {
                statusCode,
                on: (evt, cb) => {
                    if (evt === 'data') cb(body);
                    if (evt === 'end')  cb();
                }
            };

            onResponse(fakeRes);
        });
    });
}

// ── chunked transfer encoding decoder ─────────────────

function unchunk(body) {
    let result = '';
    let remaining = body;

    while (remaining.length > 0) {
        const crlfIdx = remaining.indexOf('\r\n');
        if (crlfIdx === -1) break;

        const sizeHex  = remaining.substring(0, crlfIdx).trim();
        const chunkLen = parseInt(sizeHex, 16);

        if (isNaN(chunkLen) || chunkLen === 0) break;

        const chunkStart = crlfIdx + 2;
        result    += remaining.substring(chunkStart, chunkStart + chunkLen);
        remaining  = remaining.substring(chunkStart + chunkLen + 2);
    }

    return result;
}

// ======================================================
// KICK OFF
// ======================================================

if (proxy) {
    fetchViaProxy(proxy.host, proxy.port);
} else {
    fetchDirect();
}