const SCHEMA = require("./DATABASE_SCHEMA_NAME");

const createShapeSegmentsTable = db =>
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.shape_segments (
      id           INTEGER PRIMARY KEY,
      shape_id     TEXT,
      shape_index  INTEGER,
      geoprox_key  TEXT,
      feature      TEXT
    ) WITHOUT ROWID ;

    CREATE INDEX IF NOT EXISTS ${SCHEMA}.gtfs_shape_segments_idx
      ON shape_segments (shape_id, shape_index) ;

    CREATE INDEX IF NOT EXISTS ${SCHEMA}.shape_segments_geoprox_idx
      ON shape_segments (geoprox_key) ;
  `);

module.exports = {
  createShapeSegmentsTable
};
