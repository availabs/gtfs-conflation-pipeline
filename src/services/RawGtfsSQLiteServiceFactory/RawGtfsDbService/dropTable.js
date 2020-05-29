function dropTable(tableName) {
  if (!this.supportedGtfsTables.includes(tableName)) {
    throw new Error(`UNSUPPORTED TABLE NAME ${tableName}`);
  }

  this.db.exec(`DROP TABLE IF EXISTS ${tableName} ;`);
}

module.exports = dropTable;
