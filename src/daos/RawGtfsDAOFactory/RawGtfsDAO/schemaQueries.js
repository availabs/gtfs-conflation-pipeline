const _ = require('lodash');

const db = require('../../../services/DbService');

const SUPPORTED_TABLES = require('./SUPPORTED_TABLES');

/**
 * List all GTFS tables.
 *   Not all supported GTFS files/tableName may exist in the database.
 *   This method will list the tables in the databse.
 *   Returns NULL if GTFS tables.
 *
 * @returns { string[]|null } tableNamesList[]
 */
function listTables() {
  const supportedTablesList = SUPPORTED_TABLES.map(t => `'${t}'`).join();

  const listTablesStmt = db.prepare(`
    SELECT name
      FROM sqlite_master
      WHERE ( name IN (${supportedTablesList}) )
      ORDER BY name ;`);

  const result = listTablesStmt.raw().all();

  const tableNamesList = _.flatten(result);

  return tableNamesList.length ? tableNamesList : null;
}

/**
 * List the columns for a tableName, in ordinal position.
 *   Returns NULL if there is no table matching the tableName.
 *   Otherwise returns an ordinally positioned array of the columnNames.
 *
 * @param { string } tableName The name of the table for which to list columns.
 * @returns { string[]|null } columnNamesList
 */
function listColumnsForTable(tableName) {
  // Future-proof by using the bound listTables.
  const tables = this.listTables() || [];

  if (!tables.includes(tableName)) {
    return null;
  }

  const listColumnsForTableStmt = db.prepare(`
    SELECT
        name
      FROM pragma_table_info(?)
      ORDER BY cid ;`);

  const result = listColumnsForTableStmt.raw().all([tableName]);

  const columnNamesList = _.flatten(result);

  return columnNamesList.length ? columnNamesList : null;
}

module.exports = {
  listTables,
  listColumnsForTable
};
