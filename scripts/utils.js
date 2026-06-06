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

module.exports = {
    getValueFromPath,
    getFileConfig
};
