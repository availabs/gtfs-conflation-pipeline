/* eslint-disable no-restricted-syntax, jsdoc/require-jsdoc */

const _ = require("lodash");

const db = require("../../services/DbService");

const formatRow = require("../../utils/formatRowForSqliteInsert");

const createTableFns = require("./createTableFns");

const SCHEMA = require("./DATABASE_SCHEMA_NAME");
const SUPPORTED_TABLES = require("./SUPPORTED_TABLES");

/**
 * @param { string } fileName The GTFS file name
 * @returns { string } The corresponding database table name.
 */
const getTableNameForGtfsFileName = (fileName) => {
  if (!fileName) {
    return null;
  }

  // Table names are the file names with .txt extension removed.
  const name = fileName.toLowerCase().slice(0, -4);

  const tableName = SUPPORTED_TABLES.includes(name) ? name : null;

  return tableName;
};

/**
 * Load an async iterator of table row objects into the database
 * table corresponding to the passed GTFS file name.
 * Creates the table if it doesn't exist.
 *
 * If 'clean' option is true, drops the table if it exists before loading.
 * Since this happens in a transaction, that DROP TABLE will be rolled back
 * if the load fails.
 *
 * @param { string } fileName The GTFS file name
 * @param { symbol.async_iterator } rowAsyncIterator Async iterator of table row objects
 * @returns { number|null } Number of rows added, or NULL if table was not created.
 */
async function loadAsync(fileName, rowAsyncIterator) {
  const tableName = getTableNameForGtfsFileName(fileName);

  if (!tableName) {
    return null;
  }

  const xdb = db.openLoadingConnectionToDb(SCHEMA);

  xdb.exec("BEGIN EXCLUSIVE;");

  try {
    xdb.exec(`DROP TABLE IF EXISTS ${tableName};`);

    const createTableFn = createTableFns[tableName];

    createTableFn(xdb);

    const columnsList = _.flatten(
      xdb
        .prepare(
          `SELECT
                name
              FROM ${SCHEMA}.pragma_table_info('${tableName}')
              ORDER BY cid ; `
        )
        .raw()
        .all()
    );

    const insertRowStmt = xdb.prepare(`
        INSERT INTO ${SCHEMA}.${tableName} (${columnsList})
          VALUES (${columnsList.map(() => "?")}); `);

    let rowCt = 0;

    for await (const row of rowAsyncIterator) {
      // TODO: Log warning if row has fields not in columns list
      insertRowStmt.run(formatRow(columnsList, row));
      ++rowCt;
    }

    xdb.exec("COMMIT;");
    return rowCt;
  } catch (err) {
    // Why we want the transaction.
    // This will rollback the DROP TABLE statements.
    console.error(err);
    xdb.exec("ROLLBACK;");
    throw err;
  } finally {
    db.closeLoadingConnectionToDb(xdb);
  }
}

module.exports = {
  loadAsync,
};
