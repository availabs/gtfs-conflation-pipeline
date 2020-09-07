/* eslint-disable no-restricted-syntax, jsdoc/require-jsdoc, no-continue */

// https://developers.google.com/transit/gtfs/reference#shapestxt
//
// Shapes describe the path that a vehicle travels along a route alignment,
// and are defined in the file shapes.txt. Shapes are associated with Trips,
// and consist of A SEQUENCE OF POINTS THROUGH WHICH THE VEHICLE PASSES IN ORDER.
//
// 🎉🎉🎉 The shapes are directional. 🎉🎉🎉

const assert = require("assert");

const db = require("../../services/DbService");

const logger = require("../../services/Logger");

const RawGtfsDAO = require("../RawGtfsDAO");

const { RAW_GTFS } = require("../../constants/databaseSchemaNames");
const SCHEMA = require("./DATABASE_SCHEMA_NAME");

const TripTracker = require("./TripTracker");

const {
  createScheduledTransitTrafficTable,
  createServiceDatesTable,
} = require("./createTableFns");

function loadTripStopTimes() {
  db.exec(`DROP TABLE IF EXISTS ${SCHEMA}.scheduled_transit_traffic;`);

  createScheduledTransitTrafficTable(db);

  const scheduledStopsIter = RawGtfsDAO.makeScheduledStopsIterator();

  let tripTracker = null;
  let prevWarnedTripId;

  for (const tripStop of scheduledStopsIter) {
    const { shape_id, trip_id } = tripStop;

    if (!shape_id) {
      if (trip_id !== prevWarnedTripId) {
        logger.warn(`No shape_id for trip ${trip_id}. Skipping.`);
        prevWarnedTripId = trip_id;
      }

      continue;
    }

    if (!tripTracker) {
      tripTracker = new TripTracker(tripStop);
    } else if (tripTracker.trip_id !== trip_id) {
      // Make sure we are not receiving interleaved trips
      try {
        assert(tripTracker.trip_id <= trip_id);
      } catch (err) {
        console.log(tripTracker.trip_id.localeCompare(trip_id));
        console.log(tripTracker.trip_id <= trip_id);
        console.error(tripTracker.trip_id, trip_id);
      }

      // Write the previous trip to the database
      tripTracker.writeTripToDatabase();

      // Initialize a new trip tracker
      tripTracker = new TripTracker(tripStop);
    }

    // Handle this trip stop
    tripTracker.handleStopTimesEntry(tripStop);
  }

  if (tripTracker) {
    tripTracker.writeTripToDatabase();
  }
}

function load() {
  db.unsafeMode(true);

  try {
    db.exec("BEGIN");

    loadTripStopTimes();
    createServiceDatesTable(db);

    const [rawStopTimesRows] = db
      .prepare(
        // The scheduled_transit_traffic table contains (departure, arrival) pairs.
        // Therefore, it will have one less row per trip than the stop_times table.
        `SELECT COUNT(1) - COUNT(DISTINCT trip_id) FROM ${RAW_GTFS}.stop_times ;`
      )
      .raw()
      .get();

    const [scheduledTransitTrafficRows] = db
      .prepare(`SELECT COUNT(1) FROM ${SCHEMA}.scheduled_transit_traffic ;`)
      .raw()
      .get();

    if (rawStopTimesRows !== scheduledTransitTrafficRows) {
      console.warn(
        `rawStopTimesRows: ${rawStopTimesRows}, scheduledTransitTrafficRows: ${scheduledTransitTrafficRows}`
      );
    }

    db.exec("COMMIT;");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  } finally {
    db.unsafeMode(false);
  }
}

module.exports = {
  load,
};
