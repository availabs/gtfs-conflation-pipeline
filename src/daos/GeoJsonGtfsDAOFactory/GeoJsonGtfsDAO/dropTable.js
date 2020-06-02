/* eslint-disable jsdoc/require-jsdoc */

const db = require('../../../services/DbService');

const SCHEMA = require('./DATABASE_SCHEMA_NAME');

function dropTable(tableName) {
  db.exec(`DROP TABLE IF EXISTS ${SCHEMA}.${tableName} ;`);
}

module.exports = dropTable;
