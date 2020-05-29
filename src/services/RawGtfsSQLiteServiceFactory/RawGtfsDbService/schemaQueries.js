const _ = require('lodash');

function listTables() {
  if (!this.listTablesStmt) {
    const supportedTablesList = this.supportedGtfsTables
      .map(t => `'${t}'`)
      .join();

    this.listTablesStmt = this.db.prepare(`
      SELECT name
        FROM sqlite_master
        WHERE ( name IN (${supportedTablesList}) )
        ORDER BY name
      ;
    `);
  }

  const result = this.listTablesStmt.raw().all();

  const tablesList = _.flatten(result);

  return tablesList.length ? tablesList : null;
}

function listColumnsForTable(table) {
  const tables = this.listTables(table) || [];

  if (!tables.includes(table)) {
    return null;
  }

  if (!this.listColumnsForTableStmt) {
    this.listColumnsForTableStmt = this.db.prepare(`
      SELECT
          name
        FROM pragma_table_info(?)
        ORDER BY cid
      ;`);
  }

  const result = this.listColumnsForTableStmt.raw().all([table]);

  const columnsList = _.flatten(result);

  return columnsList.length ? columnsList : null;
}

module.exports = {
  listTables,
  listColumnsForTable
};
