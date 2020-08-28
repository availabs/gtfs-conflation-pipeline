/* eslint-disable no-restricted-syntax, jsdoc/require-jsdoc, no-continue */

// https://developers.google.com/transit/gtfs/reference#shapestxt
//
// Shapes describe the path that a vehicle travels along a route alignment,
// and are defined in the file shapes.txt. Shapes are associated with Trips,
// and consist of A SEQUENCE OF POINTS THROUGH WHICH THE VEHICLE PASSES IN ORDER.
//
// 🎉🎉🎉 The shapes are directional. 🎉🎉🎉

const assert = require("assert");

const _ = require("lodash");

const db = require("../../../services/DbService");

const logger = require("../../../services/Logger");

const RawGtfsDAOFactory = require("../../RawGtfsDAOFactory");
const GtfsNetworkDAOFactory = require("../../GtfsNetworkDAOFactory");

const { RAW_GTFS } = require("../../../constants/databaseSchemaNames");
const SCHEMA = require("./DATABASE_SCHEMA_NAME");

const {
  createScheduledTransitTrafficTable,
  createServiceDatesTable,
} = require("./createTableFns");

const MINS_PER_HOUR = 60;
const SECS_PER_MIN = 60;

// HH:MM:SS => seconds into day
const getTimestamp = (time) => {
  const [h, m, s] = time.split(":").map((u) => +u);
  // ((hrs * min/hr) + mins) * sec/min + secs => seconds into day
  return (h * MINS_PER_HOUR + m) * SECS_PER_MIN + s;
};

function initializeDataStructures() {
  // this.stop2segsLookUp = new Map();

  // NOTE: We keep the possible [null] from_stop_ids array
  //       because we need the segmentedShape and fromStops
  //       arrays to be parallel.
  const orderedStopsAlongShape = this.segmentedShape.map(
    ({ properties: { from_stop_ids } }) => from_stop_ids
  );

  // All from_stops are the preceding segment's to_stops.
  //   Therefore, the orderedStopsAlongShape includes all to_stops
  //     EXCEPT the final segment's to_stops since there is
  //     no subsequent segment for which they are the from_stops.
  //
  // When snapping the stops to the shapes, sometimes a final stop
  //   does not snap to the shape's final geometry coordinate.
  // In this case, to preserve the full shape geometry,
  //   we add a dummy stop with a NULL stop_id ([null] as to_stops).
  // We are not interested in those dummy stops when tracking trips
  //   so we remove them from consideration here.
  const finalStopIds = _.get(_.last(this.segmentedShape), [
    "properties",
    "to_stop_ids",
  ]).filter((s) => s !== null);

  // Because we filtered out the NULL stops, we know that
  //   the finalStopIds represent real transit network stops.
  if (!_.isEmpty(finalStopIds)) {
    // NOTE: if this push happens,
    //       the orderedStopsAlongShape array length
    //       equals the segmentedShape array length + 1
    orderedStopsAlongShape.push(finalStopIds);
  }

  this.stops2segsFifo = {};
  this.segs2segs4stops = [];
  // For each stop-to-stop segment in the GTFS shape
  for (let i = 0; i < orderedStopsAlongShape.length; ++i) {
    const stop_ids = orderedStopsAlongShape[i];

    // Some stops are considered to represent the same transit network node
    //   because they are within a distance threshold of each other.
    // These "network-equivalent" stop ids co-occur in the stop_ids list.
    for (let j = 0; j < stop_ids.length; ++j) {
      const s = stop_ids[j];
      // console.log(s);

      // Since a stop_id may occur multiple times in a shape,
      //   we need to keep a list of all segment indices
      //   for which this stop is a from_node.
      this.stops2segsFifo[s] = this.stops2segsFifo[s] || [];
      this.stops2segsFifo[s].push(i);

      // Because a segment index may occur under multiple stops,
      //   to facilitate clean up any references to a segment after
      //   we traverse it, we keep a lookup datastructure of
      //     segment index to all stop2seg arrays containing that index.
      this.segs2segs4stops[i] = this.segs2segs4stops[i] || new Set();
      // NOTE: Using set, so idempotent.
      this.segs2segs4stops[i].add(this.stops2segsFifo[s]);

      // So we can get the stop_id from that stop's stops2segsFifo array
      // this.stop2segsLookUp.set(this.stops2segsFifo[s], s);
    }
  }

  // Reverse the stops2segsFifo arrays so they are FIFOs when using pop().
  Object.keys(this.stops2segsFifo).forEach((s) =>
    this.stops2segsFifo[s].reverse()
  );
}

class TripTracker {
  constructor({ trip_id, shape_id }) {
    const gtfsNetworkDAO = GtfsNetworkDAOFactory.getDAO();

    this.trip_id = trip_id;

    // NOTE: a shape may contain more stops than the trip
    //       because some trips along a shape skip stops.
    this.shape_id = shape_id;

    // GeoJSON[]
    this.segmentedShape = gtfsNetworkDAO.getSegmentedShape(shape_id);

    // TODO: DOCUMENT THIS INVARIANT
    //
    //  INVARIANT: No trip is a simple loop with two stops,
    //             where the origin and the destination are the same.
    //
    //       This trip tracking logic would break if the schedule is simply
    //       a loop from the same stop as origin and destination.
    //
    //       Conceivable if all stops along the way are unscheduled.
    //
    if (this.segmentedShape.length < 2) {
      throw new Error("INVARIANT BROKEN: The trip shape is a simple loop.");
    }

    // observations keeps the record of all stops along the trip.
    this.observations = [];

    initializeDataStructures.call(this);
  }

  getArrivalSegmentIndex(stop_id) {
    // The FIFO of shape segments for which this stop is the start node.
    const segIndicesForArrivalStop = this.stops2segsFifo[stop_id];

    // INVARIANT: The shape segment's from_stop_ids or to_stop_ids
    //            COMPLETELY represent the trip's stop-to-stop traversal
    //            of the segmented shape.
    if (
      // We encounted a stop_id that was NOT in the shapes from_stop_ids or to_stop_ids.
      !Array.isArray(segIndicesForArrivalStop) ||
      // OR the FIFO of shape segments for which this stop is the start node is empty.
      //   (The stop was visited more times than recorded in from_stop_ids or to_stop_ids.)
      segIndicesForArrivalStop.length === 0
    ) {
      // We throw an error because the trip tracking algorithm's assumptions are unsound.
      throw new Error(
        `INVARIANT BROKEN: No remaining segments for the stop id ${stop_id}`
      );
    }

    // Departure segment index is the previous stop time entry's arrive segment index.
    const { dptrSegIdx = 0 } = this.prevStopTimeEntry || {};

    // The next instance segment index for this stop id in the shape chain.
    //   Defensively, we peek here. We DO NOT pop because of two possible cases:
    //     1. The stop_times table includes a duplicate entry for the stop
    //     2. The stop shares the geospatial point/segment start node
    //        with another stop.
    //
    //   In other words, we play defense against inaccurrate data in the
    //     GTFS stops table and/or stop_times table.
    //
    //   If the next stop encountered has a higher segment index, this current
    //     segment index is removed from the FIFOs in the loop below.
    //   If the next stop encountered has the same segment index, we can handle it
    //     since the arvlSegIdx is still available.
    //
    const arvlSegIdx = _.last(this.stops2segsFifo[stop_id]);

    // Remove all references for segments up to, but not including
    //   this arrival stop segment index.
    //
    // We MUST do this cleanup so that
    //   for all stops skipped between the previous stop_time row and this stop_time row,
    //     those skipped stops' stops2segsFifos will have at their heads
    //     the correct (further along) segment index in case the bus trip visits
    //     the skipped stop at a later time along its journey.
    for (let i = dptrSegIdx; i < arvlSegIdx; ++i) {
      this.segs2segs4stops[i].forEach((stops2segsFifo) => {
        const fifoHead = stops2segsFifo.pop();

        // Make sure our datastructures are being correctly maintained.
        if (fifoHead !== i) {
          throw new Error("The stops2segsFifos are incorrect.");
        }
      });
    }

    return arvlSegIdx;
  }

  // Called for each entry in the stop_times table in sequence order.
  handleStopTimesEntry({ stop_id, arrival_time, departure_time }) {
    // As we receive entries from the stop_times table,
    //   we need info from the previous entry to determine
    //   distance traveled and time elapsed.

    // Get the departure info from the previous stop time entry
    const { dptrSegIdx = 0, dptrTS = null } = this.prevStopTimeEntry || {};

    const arvlSegIdx = this.getArrivalSegmentIndex(stop_id);
    const arvlTS = getTimestamp(arrival_time);

    if (
      !(
        /\d{0,2}:\d{0,2}\d{0,2}/.test(arrival_time) &&
        /\d{0,2}:\d{0,2}\d{0,2}/.test(departure_time)
      )
    ) {
      throw new Error(
        "arrival_time and departure_time must be in HH:MM:SS format."
      );
    }

    // If we have a traversal
    if (!_.isEmpty(this.prevStopTimeEntry)) {
      const travelTimeSecs = arvlTS - dptrTS;

      // Verify invariant
      if (travelTimeSecs < 0) {
        throw new Error(
          "departure_time -> arrival_time must be monotonically increasing."
        );
      }

      this.observations.push({
        dptrSegIdx,
        arvlSegIdx,
        dptrTS,
        arvlTS,
      });
    }

    this.prevStopTimeEntry = {
      // The dptrSegIdx becomes the current arvlSegIdx.
      dptrSegIdx: arvlSegIdx,
      // The dptrTS becomes this stop_times entry's departure_time.
      dptrTS: getTimestamp(departure_time),
    };
  }

  writeTripToDatabase() {
    const insertStmt = db.prepare(`
      INSERT INTO ${SCHEMA}.scheduled_transit_traffic (
        shape_id,
        departure_seg_idx,
        arrival_seg_idx,

        departure_time_sec,
        arrival_time_sec,

        trip_id
      ) VALUES (?, ?, ?, ?, ?, ?)
    ;`);

    for (let i = 0; i < this.observations.length; ++i) {
      const { dptrSegIdx, arvlSegIdx, dptrTS, arvlTS } = this.observations[i];

      insertStmt.run([
        this.shape_id,
        dptrSegIdx,
        arvlSegIdx,
        dptrTS,
        arvlTS,
        this.trip_id,
      ]);
    }
  }
}

function loadTripStopTimes() {
  const rawGtfsDAO = RawGtfsDAOFactory.getDAO();

  db.exec(`DROP TABLE IF EXISTS ${SCHEMA}.scheduled_transit_traffic;`);

  createScheduledTransitTrafficTable(db);

  const scheduledStopsIter = rawGtfsDAO.makeScheduledStopsIterator();

  let tripTracker = null;

  for (const tripStop of scheduledStopsIter) {
    const { shape_id, trip_id } = tripStop;

    if (!shape_id) {
      logger.warn("No shape_id. Skipping.");
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
