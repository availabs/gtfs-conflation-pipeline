const SCHEMA = require("./DATABASE_SCHEMA_NAME");

const createConflationMapTable = (db) =>
  db.exec(`
    CREATE TABLE ${SCHEMA}.conflation_map (
      id              INTEGER PRIMARY KEY,
      shst_reference  TEXT NOT NULL,
      networklevel    INTEGER NOT NULL,
      length_km       REAL,
      feature         TEXT NOT NULL --JSON
    ) WITHOUT ROWID ;

    CREATE INDEX IF NOT EXISTS ${SCHEMA}.conflation_map_shst_ref_idx
      ON conflation_map (shst_reference) ;
  `);

module.exports = {
  createConflationMapTable,
};
