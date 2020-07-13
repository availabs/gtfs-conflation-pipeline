const SCHEMA = require("./DATABASE_SCHEMA_NAME");

const createScheduledTransitTrafficTable = db =>
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.scheduled_transit_traffic (
        shape_id            TEXT,
        departure_seg_idx   INTEGER,
        arrival_seg_idx     INTEGER,

        departure_time_sec  INTEGER,
        arrival_time_sec    INTEGER,

        trip_id             TEXT,

      PRIMARY KEY (
        shape_id,
        departure_seg_idx,
        arrival_seg_idx,
        departure_time_sec,
        arrival_time_sec,
        trip_id
      )
    ) WITHOUT ROWID ;
  `);

module.exports = {
  createScheduledTransitTrafficTable
};
