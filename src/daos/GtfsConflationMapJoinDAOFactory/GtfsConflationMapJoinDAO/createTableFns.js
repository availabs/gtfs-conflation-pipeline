const SCHEMA = require("./DATABASE_SCHEMA_NAME");

const createMapSegmentsCospatialityTable = db =>
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

const createGtfsMatchesConflationMapJoinTable = db =>
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.gtfs_matches_conflation_map_join(
      conflation_map_id  INTEGER,
      gtfs_matches_id    INTEGER,

      PRIMARY KEY(conflation_map_id, gtfs_matches_id)
    ) WITHOUT ROWID ;
  `);

const createGtfsCountsConflationMapJoinTable = db =>
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.gtfs_counts_conflation_map_join(
      conflation_map_id  INTEGER,
      route_id           TEXT,
      dow                INTEGER,
      epoch              INTEGER,
      count              INTEGER,

      PRIMARY KEY(conflation_map_id, route_id, dow, epoch)
    ) WITHOUT ROWID ;
  `);

const createGtfsRoutesConflationMapJoinTable = db =>
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.gtfs_routes_conflation_map_join(
      conflation_map_id  INTEGER,
      routes             TEXT, -- JSON array

      PRIMARY KEY(conflation_map_id)
    ) WITHOUT ROWID ;
  `);

const createConflationMapAadtBreakdownTable = db =>
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.conflation_map_aadt_breakdown(
      conflation_map_id  INTEGER,
      aadt               INTEGER,
      aadt_by_peak       TEXT, -- JSON
      aadt_by_route      TEXT, -- JSON

      PRIMARY KEY(conflation_map_id)
    ) WITHOUT ROWID ;
  `);

module.exports = {
  createMapSegmentsCospatialityTable,
  createGtfsMatchesConflationMapJoinTable,
  createGtfsCountsConflationMapJoinTable,
  createGtfsRoutesConflationMapJoinTable,
  createConflationMapAadtBreakdownTable
};
