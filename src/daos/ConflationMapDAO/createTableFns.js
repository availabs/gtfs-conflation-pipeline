const SCHEMA = require("./DATABASE_SCHEMA_NAME");

const createConflationMapTable = (db) =>
  db.exec(`
    DROP TABLE IF EXISTS ${SCHEMA}.conflation_map;

    CREATE TABLE ${SCHEMA}.conflation_map (
      id              INTEGER PRIMARY KEY,
      shst_reference  TEXT NOT NULL,
      networklevel    INTEGER NOT NULL,
      length_km       REAL,
      feature         TEXT NOT NULL --JSON
    ) WITHOUT ROWID ;

    CREATE INDEX IF NOT EXISTS ${SCHEMA}.conflation_map_shst_ref_idx
      ON conflation_map (shst_reference) ;

    DROP TABLE IF EXISTS ${SCHEMA}.conflation_map_geopoly;

    CREATE VIRTUAL TABLE ${SCHEMA}.conflation_map_geopoly
      USING geopoly(id, networklevel) ;
  `);

module.exports = {
  createConflationMapTable,
};
