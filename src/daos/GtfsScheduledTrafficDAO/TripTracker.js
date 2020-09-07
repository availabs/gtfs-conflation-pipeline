const _ = require("lodash");

const db = require("../../services/DbService");

const GtfsNetworkDAO = require("../GtfsNetworkDAO");

const SCHEMA = require("./DATABASE_SCHEMA_NAME");

const MINS_PER_HOUR = 60;
const SECS_PER_MIN = 60;

// HH:MM:SS => seconds into day
const getTimestamp = (time) => {
  const [h, m, s] = time.split(":").map((u) => +u);
  // ((hrs * min/hr) + mins) * sec/min + secs => seconds into day
  return (h * MINS_PER_HOUR + m) * SECS_PER_MIN + s;
};

/**
 *
 */
class TripTracker {
  constructor({ trip_id, shape_id }) {
    this.trip_id = trip_id;

    // NOTE: a shape may contain more stops than the trip
    //       because some trips along a shape skip stops.
    this.shape_id = shape_id;

    // GeoJSON[]
    this.segmentedShape = GtfsNetworkDAO.getSegmentedShape(shape_id);

    if (!this.segmentedShape) {
      throw new Error(`No Segmented Shape for ${shape_id} in the database.`);
    }

    // TODO: DOCUMENT THIS INVARIANT
    //
    //  INVARIANT: No trip is a simple loop with two stops,
    //             where the origin and the destination are the same.
    //
    //       This trip tracking logic would break if the schedule is simply
    //       a loop from the same stop as origin and destination.
    //
    //       Conceivable if all stops along the way are unscheduled.
    if (this.segmentedShape.length === 0) {
      throw new Error("INVARIANT BROKEN: The trip shape contains no segments.");
    }

    if (this.segmentedShape.length === 1) {
      const [
        {
          properties: { from_stop_ids, to_stop_ids },
        },
      ] = this.segmentedShape;

      if (_.intersection(from_stop_ids, to_stop_ids).length > 0) {
        throw new Error(
          "INVARIANT BROKEN: The TripTracker does not currently support simple loop trip shapes."
        );
      }
    }

    // observations keeps the record of all stops along the trip.
    this.observations = [];

    this.initializeDataStructures();
  }

  initializeDataStructures() {
    // NOTE: from_stop_ids and to_stop_ids are arrays because
    //       the GTFS can have distinct stops (by id) that share coordinates.
    //       We need to preserve the unique IDs, even though they share
    //       the same coordinated because the GTFS trips table uses those IDs.

    // NOTE: We keep the possible [null] from_stop_ids array
    //       because we need the segmentedShape and fromStops
    //       arrays to be parallel.
    const orderedStopsAlongShape = this.segmentedShape.map(
      ({ properties: { from_stop_ids } }) => from_stop_ids
    );

    // All from_stops are the preceding segment's to_stops.
    //
    //   Therefore, the orderedStopsAlongShape created above includes all to_stops
    //     EXCEPT the final segment's to_stops since the final segment's to_stops
    //     are not a subsequent segment's from_stops.
    //
    //   Therefore, we need to push the final segment's to_stops to the
    //     orderedStopsAlongShape array to get a complete ordered list of stops
    //     along the trip.
    //
    //   NOTE: When snapping the stops to the shapes in GtfsNetworkDAO,
    //           sometimes a final stop does not snap to the shape's final geometry coord.
    //
    //         In these cases, to preserve the full shape geometry,
    //           we added a dummy stop with a NULL stop_id ([null] as to_stops).
    //
    //         We are not interested in those dummy stops when tracking trips
    //           so we filter them out of consideration here.
    //
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

    // This stops2segsFifo has the following structure:
    //   {
    //     [stop_id]: Array of seg indices for which this stop_id is a from_stop
    //   }
    //
    // NOTE: It is initialized as a LIFO, then reversed to create a FIFO.
    this.stops2segsFifo = {};

    // After we traverse a shape segment during trip tracking,
    //   we need to remove that segment from each stop_id's stops2segs FIFO.
    //   This guarantees that each time we depart from a stop_id during a trip,
    //     the next shape segment dequeued correctly corresponds to the
    //     shape segment traversed.
    // The segs2segs4stops maintains a lookup from each shape seg index
    //   to each FIFO referencing that segment, since multiple stop_ids
    //   may refer to the same segment.
    //
    // Data structure:
    //
    // ARRAY: [Set(FIFO), ...]
    //   Where the array index corresponds to the shape segment index.
    this.segs2segs4stops = [];

    // For each stop-to-stop segment in the GTFS shape
    // Again, NOTE that orderedStopsAlongShape.length may
    //   exceed the number of shape segments by 1.
    // That does not affect the trip tracking algorithm.
    for (let seg_idx = 0; seg_idx < orderedStopsAlongShape.length; ++seg_idx) {
      const stop_ids = orderedStopsAlongShape[seg_idx];

      // Some stops are considered to represent the same transit network node
      //   because they are within a distance threshold of each other.
      // These "network-equivalent" stop ids co-occur in the stop_ids list.
      for (let i = 0; i < stop_ids.length; ++i) {
        const stop_id = stop_ids[i];
        // console.log(stop_id);

        // Since a stop_id may occur multiple times in a shape,
        //   we need to keep a list of all segment indices
        //   for which this stop is a from_node.
        this.stops2segsFifo[stop_id] = this.stops2segsFifo[stop_id] || [];
        this.stops2segsFifo[stop_id].push(seg_idx);

        // Because a segment index may occur under multiple stops,
        //   to facilitate clean up any references to a segment after
        //   we traverse it, we keep a lookup datastructure of
        //     segment index to all stop2seg arrays containing that index.
        this.segs2segs4stops[seg_idx] =
          this.segs2segs4stops[seg_idx] || new Set();
        // NOTE: Using set, so idempotent.
        this.segs2segs4stops[seg_idx].add(this.stops2segsFifo[stop_id]);
      }
    }

    // Reverse the stops2segsFifo arrays so they are FIFOs when using pop().
    Object.keys(this.stops2segsFifo).forEach((stop_id) =>
      this.stops2segsFifo[stop_id].reverse()
    );
  }

  getArrivalSegmentIndex(stop_id) {
    // The FIFO of shape segments for which this stop is the from_stop.
    const segIndicesForArrivalStop = this.stops2segsFifo[stop_id];

    // INVARIANT: The Set of all from_stop_ids or to_stop_ids for the shape segment
    //            COMPLETELY represent the trip's stop-to-stop traversal of the segmented shape.
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
    // FIXME FIXME FIXME FIXME FIXME FIXME FIXME FIXME FIXME FIXME FIXME FIXME FIXME
    //
    //   This is why the TripTracker cannor handle shapes where there is only an
    //     origin and destination, and those stops are the same.
    const arvlSegIdx = _.last(this.stops2segsFifo[stop_id]);

    // Remove all references for segments up to, but not including
    //   this arrival stop segment index.
    //
    // We MUST do this cleanup so that
    //   for all stops skipped between the previous stop_time row and this stop_time row,
    //     those skipped stops' stops2segsFifos will have at their heads
    //     the correct (further along) segment index in case the bus trip visits
    //     the skipped stop later along its journey.
    for (let seg_idx = dptrSegIdx; seg_idx < arvlSegIdx; ++seg_idx) {
      this.segs2segs4stops[seg_idx].forEach((stops2segsFifo) => {
        // Dequeue the shape segment.
        const fifoHead = stops2segsFifo.pop();

        // Make sure our datastructures are being correctly maintained.
        if (fifoHead !== seg_idx) {
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

module.exports = TripTracker;
