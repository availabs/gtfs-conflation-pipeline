const SCHEMA = require("./DATABASE_SCHEMA_NAME");

const createScheduledTravelTimesTable = db =>
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.scheduled_travel_times (
      trip_id      TEXT,
      shape_id     TEXT,
      shape_index  INTEGER,
      epoch        INTEGER,
      tt           REAL,

      PRIMARY KEY (trip_id, shape_id, shape_index, epoch)
    ) WITHOUT ROWID ;
  `);

const createShstMatchesScheduleAggregationsTable = db =>
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.shst_matches_schedule_aggregations (
      -- We handle sections separately for later joining with conflation map.
      shst_reference  TEXT,
      section_start   REAL,
      section_end     REAL,

      dow             INTEGER,
      epoch           INTEGER,

      avg_tt          REAL,
      count           INTEGER,

      PRIMARY KEY (shst_reference, section_start, section_end, dow, epoch)
    ) WITHOUT ROWID ;
  `);

const createShstRefsToGtfsRoutesTable = db =>
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.shst_matches_routes (
      -- We handle sections separately for later joining with conflation map.
      shst_reference  TEXT,
      section_start   REAL,
      section_end     REAL,
      route_id        TEXT,

      PRIMARY KEY (shst_reference, section_start, section_end, route_id)
    ) WITHOUT ROWID ;
  `);

module.exports = {
  createScheduledTravelTimesTable,
  createShstMatchesScheduleAggregationsTable,
  createShstRefsToGtfsRoutesTable
};
