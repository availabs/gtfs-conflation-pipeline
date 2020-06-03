const SCHEMA = require('./DATABASE_SCHEMA_NAME');

const createStopsTable = db =>
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.stops (
        id           TEXT PRIMARY KEY,
        feature      TEXT
      ) WITHOUT ROWID ; `);

const createShapesTable = db =>
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.shapes (
        id           TEXT PRIMARY KEY,
        feature      TEXT
      ) WITHOUT ROWID; `);

module.exports = {
  createStopsTable,
  createShapesTable
};
