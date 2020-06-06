const SCHEMA = require('./DATABASE_SCHEMA_NAME');

const createShapeSegmentsTable = db =>
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.shape_segments (
      shape_id       TEXT,
      shape_index    INTEGER,
      from_stop_ids  TEXT,
      to_stop_ids    TEXT,
      geoprox_key    TEXT,
      feature        TEXT,

      PRIMARY KEY (shape_id, shape_index)
    ) WITHOUT ROWID ;

    CREATE INDEX IF NOT EXISTS ${SCHEMA}.shape_segments_geoprox_idx
      ON shape_segments (geoprox_key) ;
  `);

module.exports = {
  createShapeSegmentsTable
};
