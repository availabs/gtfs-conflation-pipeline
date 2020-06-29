/* eslint-disable no-restricted-syntax, jsdoc/require-jsdoc, no-continue */

const assert = require("assert");

const _ = require("lodash");

const db = require("../../../services/DbService");

const logger = require("../../../services/Logger");

const RawGtfsDAOFactory = require("../../RawGtfsDAOFactory");
const GtfsNetworkDAOFactory = require("../../GtfsNetworkDAOFactory");

const {
  RAW_GTFS,
  GTFS_OSM_NETWORK
} = require("../../../constants/databaseSchemaNames");

const SCHEMA = require("./DATABASE_SCHEMA_NAME");

const {
  createScheduledTravelTimesTable,
  createShstMatchesScheduleAggregationsTable,
  createShstRefsToGtfsRoutesTable
} = require("./createTableFns");

// https://developers.google.com/transit/gtfs/reference#shapestxt
//
// Shapes describe the path that a vehicle travels along a route alignment,
// and are defined in the file shapes.txt. Shapes are associated with Trips,
// and consist of A SEQUENCE OF POINTS THROUGH WHICH THE VEHICLE PASSES IN ORDER.
//
// 🎉🎉🎉 The shapes are directional. 🎉🎉🎉

const MINS_PER_HOUR = 60;
const SECS_PER_MIN = 60;
const SECS_PER_EPOCH = 5 /* min */ * SECS_PER_MIN;

const getTimestamp = time => {
  const [h, m, s] = time.split(":");
  return (+h * MINS_PER_HOUR + +m) * SECS_PER_MIN + +s;
};

const getEpoch = timestamp => Math.floor(timestamp / SECS_PER_EPOCH);

class TripTracker {
  constructor({ trip_id, shape_id }) {
    const gtfsNetworkDAO = GtfsNetworkDAOFactory.getDAO();

    this.shape_id = shape_id;
    this.trip_id = trip_id;

    // console.log(shape_id);
    this.segmentedShape = gtfsNetworkDAO.getSegmentedShape(shape_id);

    // console.log(
    // JSON.stringify(
    // this.segmentedShape.map(s => _.omit(s, "geometry")),
    // null,
    // 4
    // )
    // );

    this.stops2segs = {};
    this.segs2segs4stops = [];
    this.stop2segsLookUp = new Map();

    for (let i = 0; i < this.segmentedShape.length; ++i) {
      const seg = this.segmentedShape[i];
      const {
        properties: { from_stop_ids }
      } = seg;

      // Some stops are considered to represent the same transit network node
      //   because they are within a distance threshold of each other.
      // These "network-equivalent" stop ids co-occur in the from_stop_ids list.
      for (let j = 0; j < from_stop_ids.length; ++j) {
        const s = from_stop_ids[j];
        // console.log(s);

        // Since a stop_id may occur multiple times in a shape,
        //   we need to keep a list of all segment indices for a stop.
        this.stops2segs[s] = this.stops2segs[s] || [];
        this.stops2segs[s].push(i);

        // To clean up any references to a segment after we traverse it,
        //   for each
        this.segs2segs4stops[i] = this.segs2segs4stops[i] || new Set();
        // Set, so idempotent
        this.segs2segs4stops[i].add(this.stops2segs[s]);

        this.stop2segsLookUp.set(this.stops2segs[s], s);
      }
    }

    const lastSegmentToStopIds = _.get(_.last(this.segmentedShape), [
      "properties",
      "to_stop_ids"
    ]).filter(s => s !== null);

    for (let i = 0; i < lastSegmentToStopIds.length; ++i) {
      const dummyIdx = this.segmentedShape.length;

      const s = lastSegmentToStopIds[i];
      // console.log("*".repeat(30));
      // console.log(JSON.stringify({ dummyIdx, lastSegmentToStopIds }, null, 4));
      // console.log("*".repeat(30));

      // Since a stop_id may occur multiple times in a shape,
      //   we need to keep a list of all segment indices for a stop.
      this.stops2segs[s] = this.stops2segs[s] || [];
      this.stops2segs[s].push(dummyIdx);

      // To clean up any references to a segment after we traverse it,
      //   for each
      this.segs2segs4stops[dummyIdx] =
        this.segs2segs4stops[dummyIdx] || new Set();

      // Set, so idempotent
      this.segs2segs4stops[dummyIdx].add(this.stops2segs[s]);
    }

    // Make the stop -> segIndex lists FIFOs so we can use pop().
    Object.keys(this.stops2segs).forEach(s => this.stops2segs[s].reverse());

    this.stops2segsClone = _.cloneDeep(this.stops2segs);
    this.segs2segs4stopsClone = this.segs2segs4stops.map(s => [...s]);

    this.observations = [];
    this.prevStopTimeEntry = null;

    // console.log(
    // JSON.stringify(
    // {
    // segmentedShape: this.segmentedShape.map(s => _.omit(s, "geometry"))
    // },
    // null,
    // 4
    // )
    // );
  }

  handleStopTimesEntry({ stop_id, arrival_time, departure_time }) {
    // console.log("=".repeat(30));

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

    // console.log(JSON.stringify(this.stops2segs, null, 4));

    const segIndicesForArrivalStop = this.stops2segs[stop_id];

    if (
      !Array.isArray(segIndicesForArrivalStop) ||
      segIndicesForArrivalStop.length === 0
    ) {
      console.log(
        JSON.stringify(
          {
            // segmentedShape: this.segmentedShape.map(s => _.omit(s, "geometry")),
            trip_id: this.trip_id,
            stop_id,
            arrival_time,
            departure_time
            // stops2segs: this.stops2segs,
            // stops2segsClone: this.stops2segsClone,
            // segs2segs4stopsClone: this.segs2segs4stopsClone
          },
          null,
          4
        )
      );

      throw new Error(
        `INVARIANT BROKEN: No remaining segments for the stop id ${stop_id}`
      );
    }

    const { dptrSegIdx = 0, dptrTS = null } = this.prevStopTimeEntry || {};

    // The next instance segment index for this stop id in the shape chain.
    // Because multiple stop ids (that identify the same network node) may
    //   reference this segment, wait to remove the seg reference so ref
    //   removals can happen in one place.
    const arvlSegIdx = _.last(this.stops2segs[stop_id]);

    // The departure segment (inclusive) to arrival segment (non-inclusive).
    // Buses ENTER segments ONLY when moving through them.
    const traversedSegsChain = this.segmentedShape.slice(
      dptrSegIdx,
      arvlSegIdx
    );

    // If we have a traversal
    if (this.prevStopTimeEntry !== null) {
      const arvlTS = getTimestamp(arrival_time);

      const travelTimeSecs = arvlTS - dptrTS;

      if (travelTimeSecs < 0) {
        throw new Error(
          "departure_time -> arrival_time must be monotonically increasing."
        );
      }

      // TODO: Should be using the lengths from conflation output
      //       because OSM is higher resolution and more accurate.
      //       Make the switch once conflation output is improved.
      const segLens = traversedSegsChain.map(
        ({ properties: { start_dist, stop_dist } }) => stop_dist - start_dist
      );

      const totalDistTraveled = _.sum(segLens);

      const travelTimesPerSegment = segLens.map(
        len => (travelTimeSecs * len) / totalDistTraveled
      );

      const segDptrTimes = travelTimesPerSegment.reduce(
        (acc, tt) => {
          const prevSegDptrTS = _.last(acc);
          acc.push(prevSegDptrTS + tt);
          return acc;
        },
        [dptrTS] // departure time from the previous stop_times entry
      );

      const segDprtEpochs = segDptrTimes.map(getEpoch);

      // console.log(
      // JSON.stringify(
      // {
      // dptrTS,
      // arvlTS,
      // travelTimeSecs,
      // segLens,
      // totalDistTraveled,
      // travelTimesPerSegment,
      // segDptrTimes,
      // segDprtEpochs
      // },
      // null,
      // 4
      // )
      // );

      for (let i = 0; i < traversedSegsChain.length; ++i) {
        const {
          properties: { shape_index }
        } = traversedSegsChain[i];
        const epoch = segDprtEpochs[i];
        const tt = travelTimesPerSegment[i];

        this.observations.push({ shape_index, epoch, tt });

        // Remove this segment from all stops2segs FIFOs
        // console.log(shape_index);
        // this.segs2segs4stops[shape_index].forEach(stops2segsArr => {
        // console.log(
        // "1. Popping stop",
        // this.stop2segsLookUp.get(stops2segsArr)
        // );
        // stops2segsArr.pop();
        // });
      }
    }

    // console.log(JSON.stringify([...this.segs2segs4stops[1]], null, 4));

    // Remove all references for segments up to and including the arrival stop segment.
    for (let i = dptrSegIdx; i < arvlSegIdx; ++i) {
      // Remove this segment from all stops2segs FIFOs
      this.segs2segs4stops[i].forEach(stops2segsArr => {
        // console.log("2. Popping stop", this.stop2segsLookUp.get(stops2segsArr));
        stops2segsArr.pop();
      });
    }

    this.prevStopTimeEntry = {
      dptrSegIdx: arvlSegIdx,
      dptrTS: getTimestamp(departure_time)
    };
  }

  writeToDatabase() {
    const insertStmt = db.prepare(`
      INSERT INTO ${SCHEMA}.scheduled_travel_times (
        trip_id,
        shape_id,
        shape_index,
        epoch,
        tt
      ) VALUES (?, ?, ?, ?, ?) ;`);

    for (let i = 0; i < this.observations.length; ++i) {
      const { shape_index, epoch, tt } = this.observations[i];

      insertStmt.run([
        this.trip_id,
        this.shape_id,
        shape_index,
        epoch,
        _.round(tt, 3)
      ]);
    }
  }
}

//  CREATE TABLE IF NOT EXISTS ${SCHEMA}.scheduled_travel_times (
//    trip_id      TEXT,
//    shape_id     TEXT,
//    shape_index  INTEGER,
//    epoch        INTEGER,
//    tt           REAL,
//
//    PRIMARY KEY (trip_id, shape_id, shape_index, epoch)
//  ) WITHOUT ROWID ;
//
//  CREATE TABLE IF NOT EXISTS ${SCHEMA}.shst_matches_shedule_aggregations (
//    -- The spatial.
//    --   We keep handle sections separately for later joining with conflation map.
//    shst_reference  TEXT,
//    section_start   REAL,
//    section_end     REAL,
//
//    -- The temporal
//    dow             INTEGER,
//    epoch           INTEGER,
//
//    -- The synthetic probe data
//    avg_tt          REAL,
//    count           INTEGER
//
//    PRIMARY KEY (shst_reference, section_start, section_end)
//  ) WITHOUT ROWID ;

function loadTripStopTimes() {
  const rawGtfsDAO = RawGtfsDAOFactory.getDAO();

  db.exec(`DROP TABLE IF EXISTS ${SCHEMA}.scheduled_travel_times; `);

  createScheduledTravelTimesTable(db);

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
      tripTracker.writeToDatabase();

      // Initialize a new trip tracker
      tripTracker = new TripTracker(tripStop);
    }

    // Handle this trip stop
    tripTracker.handleStopTimesEntry(tripStop);
  }

  if (tripTracker) {
    tripTracker.writeToDatabase();
  }
}

function joinSheduledTripsWithShstMatches() {
  db.attachDatabase(RAW_GTFS);
  db.attachDatabase(GTFS_OSM_NETWORK);

  db.exec(
    `DROP TABLE IF EXISTS ${SCHEMA}.shst_matches_schedule_aggregations; `
  );
  createShstMatchesScheduleAggregationsTable(db);

  db.prepare(
    `
    INSERT INTO ${SCHEMA}.shst_matches_schedule_aggregations (
        shst_reference,
        section_start,
        section_end,
        dow,
        epoch,
        avg_tt,
        count
      )
      SELECT
          shst_reference,
          section_start,
          section_end,

          dow,
          epoch,

          ROUND(
            AVG(tt),
            3
          ) AS avg_tt,
          COUNT(1) AS count
        FROM ${SCHEMA}.scheduled_travel_times
          INNER JOIN ${GTFS_OSM_NETWORK}.tmp_gtfs_network_matches
            USING (shape_id, shape_index)
          INNER JOIN ${RAW_GTFS}.trips
            USING (trip_id)
          INNER JOIN (
            SELECT
                service_id,
                service_dows_each.key AS dow
              FROM (
                SELECT
                    service_id,
                    json_array(
                      sunday,
                      monday,
                      tuesday,
                      wednesday,
                      thursday,
                      friday,
                      saturday,
                      sunday
                    ) AS dows
                  FROM ${RAW_GTFS}.calendar
              ) AS service_dows, json_each(dows) AS service_dows_each
              WHERE service_dows_each.value = 1
          ) USING (service_id)
        GROUP BY shst_reference, section_start, section_end, dow, epoch ;`
  ).run();
}

function loadShstRefsGtfsRoutesTable() {
  db.attachDatabase(RAW_GTFS);
  db.attachDatabase(GTFS_OSM_NETWORK);

  db.exec(`DROP TABLE IF EXISTS ${SCHEMA}.shst_matches_routes; `);
  createShstRefsToGtfsRoutesTable(db);

  db.prepare(
    `
    INSERT INTO ${SCHEMA}.shst_matches_routes (
        shst_reference,
        section_start,
        section_end,
        routes
      )
      SELECT
          shst_reference,
          section_start,
          section_end,
          json_group_array( DISTINCT route_id)
        FROM ${SCHEMA}.scheduled_travel_times
          INNER JOIN ${GTFS_OSM_NETWORK}.tmp_gtfs_network_matches
            USING (shape_id, shape_index)
          INNER JOIN ${RAW_GTFS}.trips
            USING (trip_id)
        GROUP BY shst_reference, section_start, section_end; `
  ).run();
}

function load() {
  GtfsNetworkDAOFactory.getDAO();

  db.unsafeMode(true);

  try {
    db.exec("BEGIN");

    loadTripStopTimes();
    joinSheduledTripsWithShstMatches();
    loadShstRefsGtfsRoutesTable();

    db.exec("COMMIT;");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  } finally {
    db.unsafeMode(false);
  }
}

module.exports = {
  load
};
