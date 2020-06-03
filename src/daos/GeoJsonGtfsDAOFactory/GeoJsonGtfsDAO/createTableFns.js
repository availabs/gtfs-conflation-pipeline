const SCHEMA = require('./DATABASE_SCHEMA_NAME');

const createStopsTable = db =>
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.stops (
        id           TEXT PRIMARY KEY,
        geoprox_key  TEXT,
        feature      TEXT
      ) WITHOUT ROWID ;

    CREATE INDEX IF NOT EXISTS ${SCHEMA}.stops_iteration_order_idx
      ON stops(geoprox_key); `);

const createShapesTable = db =>
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.shapes (
        id           TEXT PRIMARY KEY,
        geoprox_key  TEXT,
        feature      TEXT
      ) WITHOUT ROWID;

    CREATE INDEX IF NOT EXISTS ${SCHEMA}.shapes_iteration_order_idx
      ON shapes(geoprox_key); `);

module.exports = {
  createStopsTable,
  createShapesTable
};
