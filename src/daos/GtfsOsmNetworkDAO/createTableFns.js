const SCHEMA = require("./DATABASE_SCHEMA_NAME");

const createTmpShstMatchFeaturesTable = (db) =>
  db.exec(`
      DROP TABLE IF EXISTS ${SCHEMA}.tmp_shst_match_features;

      CREATE TABLE IF NOT EXISTS ${SCHEMA}.tmp_shst_match_features (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        shape_id        TEXT,
        shape_index     INTEGER,
        shst_reference  TEXT,
        section_start   REAL,
        section_end     REAL,
        osrm_dir        TEXT,
        feature_len_km  REAL,
        feature         TEXT,
        
        UNIQUE (shape_id, shape_index, shst_reference, section_start, section_end)
      ) ;
  `);

const createGtfsShapeShstMatchPathsTable = (db) =>
  db.exec(`
    DROP TABLE IF EXISTS ${SCHEMA}.gtfs_shape_shst_match_paths;

    CREATE TABLE IF NOT EXISTS ${SCHEMA}.gtfs_shape_shst_match_paths (
      gtfs_shape_id     INTEGER,
      gtfs_shape_index  INTEGER,
      path_index        INTEGER,
      path_edge_index   INTEGER,
      shst_match_id     INTEGER,
      shst_reference    TEXT,
      shst_ref_start    REAL,
      shst_ref_end      REAL,
      
      PRIMARY KEY (gtfs_shape_id, gtfs_shape_index, path_index, path_edge_index)
    ) WITHOUT ROWID;

    CREATE INDEX ${SCHEMA}.gtfs_shape_shst_match_paths_match_id_idx
      ON gtfs_shape_shst_match_paths (shst_match_id) ;
  `);

const createGtfsShapeShstMatchScoresTable = (db) =>
  db.exec(`
    DROP TABLE IF EXISTS ${SCHEMA}.gtfs_shape_shst_match_scores;

    CREATE TABLE IF NOT EXISTS ${SCHEMA}.gtfs_shape_shst_match_scores (
      gtfs_shape_id     INTEGER,
      gtfs_shape_index  INTEGER,
      scores            TEXT,
      
      PRIMARY KEY (gtfs_shape_id, gtfs_shape_index)
    ) WITHOUT ROWID;
  `);

module.exports = {
  createTmpShstMatchFeaturesTable,
  createGtfsShapeShstMatchPathsTable,
  createGtfsShapeShstMatchScoresTable,
};
