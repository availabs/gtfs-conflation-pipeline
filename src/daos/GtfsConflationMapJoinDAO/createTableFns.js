const SCHEMA = require("./DATABASE_SCHEMA_NAME");

const createMapSegmentsCospatialityTable = (db) =>
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.map_segments_cospatiality(
      conflation_map_id  INTEGER,
      gtfs_matches_id    INTEGER,

      intersection_len   REAL,

      conf_map_seg_len   REAL,
      conf_map_pre_len   REAL,
      conf_map_post_len  REAL,

      gtfs_map_seg_len   REAL,
      gtfs_map_pre_len   REAL,
      gtfs_map_post_len  REAL,

      PRIMARY KEY(conflation_map_id, gtfs_matches_id)
    ) WITHOUT ROWID ;
  `);

const createGtfsMatchesConflationMapJoinTable = (db) =>
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.gtfs_matches_conflation_map_join(
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      gtfs_shape_id      INTEGER,
      gtfs_shape_index   INTEGER,

      conflation_map_id  INTEGER,

      conf_map_seg_len   REAL,
      conf_map_pre_len   REAL,
      conf_map_post_len  REAL,

      intersection_len   REAL,

      along_idx          INTEGER,

      UNIQUE (
        gtfs_shape_id,
        gtfs_shape_index,
        conflation_map_id,
        along_idx
      )
    ) ;
  `);

module.exports = {
  createMapSegmentsCospatialityTable,
  createGtfsMatchesConflationMapJoinTable,
};
