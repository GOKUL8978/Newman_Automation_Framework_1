// ======================================
// scripts/utils.js
// ======================================

/**
 * Extracts a value from a nested object
 * using a dot-path string.
 * Supports array indexing: "data.orders[0].id"
 */
function getValueFromPath(obj, jsonPath) {

    try {

        return jsonPath
            .replace(/\[(\d+)\]/g, '.$1')
            .split('.')
            .reduce(
                (acc, key) =>
                    acc && acc[key],
                obj
            );

    } catch {

        return '';
    }
}

/**
 * Normalises a folderMapping entry.
 *
 * Accepts both:
 *   "Create_User": "./data/data.csv"
 *   "Orders_API":  { file: "...", worksheet: "Sheet1" }
 *
 * Always returns { file, worksheet }.
 */
function getFileConfig(folderCsvMap, folderName) {

    const config =
        folderCsvMap[folderName];

    if (typeof config === 'string') {

        return {
            file: config,
            worksheet: ''
        };
    }

    return config || {};
}

// ======================================
// DATE & BOOLEAN SANITISATION
// ======================================

/**
 * Normalises a single cell value:
 *
 *   • Dates  → yyyy-mm-dd
 *             Accepts: yyyy-mm-dd, mm/dd/yyyy, dd-mm-yyyy,
 *                      Excel serial numbers, JS Date objects,
 *                      any string moment can parse.
 *             Invalid dates are preserved as-is so that
 *             negative-scenario rows reach the API unchanged.
 *
 *   • Booleans / boolean-strings → lowercase 'true' / 'false'
 *             Catches: true, false, TRUE, FALSE, True, False,
 *                      and the strings "true" / "false" in any case.
 *
 *   • Everything else → returned unchanged.
 */
function sanitizeCellValue(value) {

    // ── Boolean ───────────────────────────────────────
    if (typeof value === 'boolean') {
        return String(value); // true → "true", false → "false"
    }

    if (
        typeof value === 'string' &&
        /^(true|false)$/i.test(value.trim())
    ) {
        return value.trim().toLowerCase();
    }

    // ── Date (JS Date object from xlsx raw:true mode) ─
    if (value instanceof Date) {

        if (isNaN(value.getTime())) {
            return value; // invalid Date object — pass through
        }

        return formatDateISO(value);
    }

    // ── String that looks like a date ─────────────────
    if (typeof value === 'string' && value.trim() !== '') {

        const normalised = tryParseDate(value.trim());

        if (normalised !== null) {
            return normalised;
        }
    }

    return value;
}

/**
 * Formats a valid JS Date as yyyy-mm-dd (local date, no timezone shift).
 */
function formatDateISO(date) {

    const yyyy = date.getFullYear();
    const mm   = String(date.getMonth() + 1).padStart(2, '0');
    const dd   = String(date.getDate()).padStart(2, '0');

    return `${yyyy}-${mm}-${dd}`;
}

/**
 * Tries to recognise common date string patterns and returns
 * a yyyy-mm-dd string, or null if the input doesn't look like
 * a date or is clearly invalid (e.g. month 13, day 32).
 *
 * Patterns handled:
 *   yyyy-mm-dd   (already correct — validate only)
 *   mm/dd/yyyy   (US locale — Excel default on many systems)
 *   dd-mm-yyyy   (European)
 *   dd/mm/yyyy   (European slash)
 *   mm-dd-yyyy   (US dash)
 */
function tryParseDate(str) {

    // Already yyyy-mm-dd
    const isoMatch = str.match(
        /^(\d{4})-(\d{2})-(\d{2})$/
    );
    if (isoMatch) {
        const [, y, m, d] = isoMatch.map(Number);
        if (isValidDate(y, m, d)) return str; // already correct
        return null;                           // invalid — pass through
    }

    // mm/dd/yyyy  or  mm/yy/dd  (Excel locale mangling)
    const usSlash = str.match(
        /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
    );
    if (usSlash) {
        const [, m, d, y] = usSlash.map(Number);
        if (isValidDate(y, m, d)) return formatDateISO(new Date(y, m - 1, d));
        return null;
    }

    // dd-mm-yyyy
    const euDash = str.match(
        /^(\d{1,2})-(\d{1,2})-(\d{4})$/
    );
    if (euDash) {
        const [, d, m, y] = euDash.map(Number);
        if (isValidDate(y, m, d)) return formatDateISO(new Date(y, m - 1, d));
        return null;
    }

    // dd/mm/yyyy
    const euSlash = str.match(
        /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
    );
    if (euSlash) {
        // Ambiguous with mm/dd/yyyy — try dd/mm first, fall back to mm/dd
        const [, a, b, y] = euSlash.map(Number);
        if (b > 12 && isValidDate(y, b, a)) {
            // b can't be a month, so a=dd b=mm
            return formatDateISO(new Date(y, b - 1, a));
        }
        if (isValidDate(y, a, b)) {
            return formatDateISO(new Date(y, a - 1, b));
        }
        return null;
    }

    // mm-dd-yyyy
    const usDash = str.match(
        /^(\d{1,2})-(\d{1,2})-(\d{4})$/
    );
    if (usDash) {
        const [, m, d, y] = usDash.map(Number);
        if (isValidDate(y, m, d)) return formatDateISO(new Date(y, m - 1, d));
        return null;
    }

    return null; // not a recognised date pattern
}

/**
 * Returns true only for calendar-valid year/month/day combos.
 * Month and day must be in range, and the resulting Date must
 * not roll over (e.g. Feb 30 → March 1 would fail).
 */
function isValidDate(year, month, day) {

    if (
        month < 1 || month > 12 ||
        day   < 1 || day   > 31 ||
        year  < 1000
    ) {
        return false;
    }

    const d = new Date(year, month - 1, day);

    return (
        d.getFullYear() === year &&
        d.getMonth()    === month - 1 &&
        d.getDate()     === day
    );
}

/**
 * Applies sanitizeCellValue() to every value in a row object.
 * Pass `dateColumns` (array of column names) to restrict date
 * processing to known date fields — leave undefined to scan all.
 */
function sanitizeRow(row, dateColumns) {

    const result = {};

    Object.keys(row).forEach(key => {

        const value = row[key];

        const shouldSanitizeDate =
            !dateColumns || dateColumns.includes(key);

        if (!shouldSanitizeDate) {
            // still sanitize booleans everywhere
            result[key] =
                (typeof value === 'boolean' ||
                 (typeof value === 'string' &&
                  /^(true|false)$/i.test(value.trim())))
                    ? sanitizeCellValue(value)
                    : value;
        } else {
            result[key] = sanitizeCellValue(value);
        }
    });

    return result;
}

module.exports = {
    getValueFromPath,
    getFileConfig,
    sanitizeRow
};
