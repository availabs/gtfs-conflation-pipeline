const _ = require('lodash');

/**
 * Inserting integers into TEXT columns appends decimal portion.
 *   This function
 * See: https://github.com/JoshuaWise/better-sqlite3/issues/309#issuecomment-539694993
 *
 * @param { string[] } columnsList The ordered-list of table columns.
 * @param { object } row The data to be inserted as a table row.
 * @returns { string[] } The row data in an array, ready for use in parameterized insert stmt.
 */
const formatRowForSqliteInsert = (columnsList, row) =>
  columnsList.map(col => (_.isNil(row[col]) ? null : `${row[col]}`));

module.exports = formatRowForSqliteInsert;
