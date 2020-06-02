// https://developers.google.com/transit/gtfs/reference

// Two classes of constraints:
// * INVARIANT: code assumes
// * SPECIFICATION: for generating metadata

// INVARIANTs in CREATE TABLEs. Conflation assumes these.
//
// SPECIFICATIONs in an optional DDL file.
//   Can be used to validate the GTFS.

const SCHEMA = require('./DATABASE_SCHEMA_NAME');

const createAgencyTable = db =>
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.agency (
        agency_id        TEXT PRIMARY KEY,
        agency_name      TEXT,
        agency_url       TEXT,
        agency_timezone  TEXT,
        agency_lang      TEXT,
        agency_phone     TEXT,
        agency_fare_url  TEXT,
        agency_email     TEXT
      ) WITHOUT ROWID ;`);

const createStopsTable = db =>
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.stops (
        stop_id              TEXT PRIMARY KEY,
        stop_code            TEXT,
        stop_name            TEXT,
        stop_desc            TEXT,
        stop_lat             REAL,
        stop_lon             REAL,
        zone_id              TEXT,
        stop_url             TEXT,
        location_type        INTEGER,
        stop_timezone        TEXT,
        wheelchair_boarding  TEXT
      ) WITHOUT ROWID ;`);

const createRoutesTable = db =>
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.routes (
        route_id          TEXT PRIMARY KEY,
        agency_id         TEXT,
        route_short_name  TEXT,
        route_long_name   TEXT,
        route_desc        TEXT,
        route_type        INTEGER,
        route_url         TEXT,
        route_color       TEXT,
        route_text_color  TEXT
      ) WITHOUT ROWID ;`);

const createTripsTable = db =>
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.trips (
        route_id               TEXT,
        service_id             TEXT,
        trip_id                TEXT,
        trip_headsign          TEXT,
        direction_id           TEXT,
        shape_id               TEXT,
        wheelchair_accessible  TEXT,
        bikes_allowed          TEXT,

        PRIMARY KEY (route_id, service_id, trip_id)
      ) WITHOUT ROWID ;

    CREATE INDEX IF NOT EXISTS ${SCHEMA}.trips_trip_id_idx
      ON trips (trip_id) ;

    CREATE INDEX IF NOT EXISTS ${SCHEMA}.trips_times_service_id_idx
      ON trips (service_id) ; `);

const createStopTimesTable = db =>
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.stop_times (
        trip_id              TEXT,
        arrival_time         TEXT,
        departure_time       TEXT,
        stop_id              TEXT,
        stop_sequence        INTEGER,
        stop_headsign        TEXT,
        pickup_type          INTEGER,
        drop_off_type        INTEGER,
        shape_dist_traveled  REAL,
        timepoint            INTEGER,

        PRIMARY KEY (trip_id, stop_sequence)
      ) WITHOUT ROWID;

    CREATE INDEX IF NOT EXISTS ${SCHEMA}.stop_times_trip_stop_idx
      ON stop_times (trip_id, stop_id) ;
  `);

const createCalendarTable = db =>
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.calendar (
        service_id  TEXT PRIMARY KEY,
        monday      INTEGER NOT NULL CHECK (monday    IN (0, 1)),
        tuesday     INTEGER NOT NULL CHECK (tuesday   IN (0, 1)),
        wednesday   INTEGER NOT NULL CHECK (wednesday IN (0, 1)),
        thursday    INTEGER NOT NULL CHECK (thursday  IN (0, 1)),
        friday      INTEGER NOT NULL CHECK (friday    IN (0, 1)),
        saturday    INTEGER NOT NULL CHECK (saturday  IN (0, 1)),
        sunday      INTEGER NOT NULL CHECK (sunday    IN (0, 1)),
        start_date  TEXT NOT NULL,
        end_date    TEXT NOT NULL
      ) WITHOUT ROWID ;`);

const createCalendarDatesTable = db =>
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.calendar_dates (
        service_id      TEXT,
        date            TEXT NOT NULL,
        exception_type  TEXT NOT NULL,

        PRIMARY KEY (service_id, date)
      ) WITHOUT ROWID ;`);

const createFareAttributesTable = db =>
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.fare_attributes (
        fare_id            TEXT PRIMARY KEY,
        price              REAL,
        currency_type      TEXT,
        payment_method     INTEGER,
        transfers          INTEGER,
        agency_id          TEXT,
        transfer_duration  INTEGER
      ) WITHOUT ROWID;`);

const createFareRulesTable = db =>
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.fare_rules (
        fare_id         TEXT,
        route_id        TEXT,
        origin_id       TEXT,
        destination_id  TEXT,
        contains_id     TEXT
      );`);

const createShapesTable = db =>
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.shapes (
        shape_id             TEXT,
        shape_pt_lat         REAL NOT NULL,
        shape_pt_lon         REAL NOT NULL,
        shape_pt_sequence    INTEGER,
        shape_dist_traveled  REAL,

        PRIMARY KEY (shape_id, shape_pt_sequence)
      ) WITHOUT ROWID;`);

const createFrequenciesTable = db =>
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.frequencies (
        trip_id       TEXT PRIMARY KEY,
        start_time    TEXT,
        end_time      TEXT,
        headway_secs  INTEGER,
        exact_times   INTEGER
      ) WITHOUT ROWID;`);

const createTransfersTable = db =>
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.transfers (
        from_stop_id      TEXT NOT NULL,
        to_stop_id        TEXT NOT NULL,
        transfer_type     INTEGER NOT NULL CHECK (transfer_type IN (0, 1, 2, 3)),
        min_transfer_time INTEGER
      );`);

const createFeedInfoTable = db =>
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.feed_info (
        feed_publisher_name  TEXT PRIMARY KEY,
        feed_publisher_url   TEXT,
        feed_lang            TEXT,
        feed_start_date      TEXT,
        feed_end_date        TEXT,
        feed_version         TEXT
      ) WITHOUT ROWID;`);

module.exports = {
  agency: createAgencyTable,
  stops: createStopsTable,
  routes: createRoutesTable,
  trips: createTripsTable,
  stop_times: createStopTimesTable,
  calendar: createCalendarTable,
  calendar_dates: createCalendarDatesTable,
  fare_attributes: createFareAttributesTable,
  fare_rules: createFareRulesTable,
  shapes: createShapesTable,
  frequencies: createFrequenciesTable,
  transfers: createTransfersTable,
  feed_info: createFeedInfoTable
};
