// ======================================================
// runner.js
// Entry point — set your folder and iteration count here
// ======================================================

// ======================================================
// PROVIDE FOLDER NAME
// ======================================================

// The exact name of the folder in your Postman collection
// to run. Must match the folder name in Postman exactly.

// Examples:
//   'Create_User'
//   'Orders_API'
//   null  -> runs ROOT (all requests, no folder filter)

const folderName =
    'Create_User';

// ======================================================
// PROVIDE ITERATION COUNT
// ======================================================

// How many rows from the data file to run.

// Examples:
//   null -> run ALL rows
//   1    -> run first row only
//   5    -> run first 5 rows

const iterationCount =
    null;

// ======================================================
// SET ARGUMENTS
// ======================================================

process.argv[2] =
    folderName;

process.argv[3] =
    iterationCount;

// ======================================================
// RUN FRAMEWORK
// ======================================================

require('./scripts/run-tests');
