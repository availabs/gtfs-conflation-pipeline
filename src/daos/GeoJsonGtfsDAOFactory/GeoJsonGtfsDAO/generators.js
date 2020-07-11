/* eslint-disable no-restricted-syntax, jsdoc/require-jsdoc, no-param-reassign */

const _ = require("lodash");
const turf = require("@turf/turf");

const db = require("../../../services/DbService");

const toParsedFeaturesIterator = require("../../../utils/toParsedFeaturesIterator");

const MILES = "miles";
const KILOMETERS = "kilometers";

const {
  RAW_GTFS: RAW_GTFS_SCHEMA
} = require("../../../constants/databaseSchemaNames");

const GEOJSON_SCHEMA = require("./DATABASE_SCHEMA_NAME");

const convertStopsShapeDistTraveledToKilometers = (shape, stopsSeq) => {
  const seq = _.cloneDeep(stopsSeq);

  // ASSUMPTION: We assume that the last stop in the stops sequence is close enough
  //             to the shape endpoint that the value of last stop's
  //             stop_times.shape_dist_traveled is closest in value to
  //             the shape length when they are in the same units.
  //
  //             This is NOT NECESSARILY the case.
  //
  //             A last stop far enough inside the shape may invalidate the assumption.
  //
  //   REMEDY:
  //           The units of the OPTIONAL shapes.shape_dist_traveled column
  //             and the OPTIONAL stop_times.shape_dist_traveled column
  //             MUST be the same according to the GTFS specification.
  //
  //           Using shapes.shape_dist_traveled, if it is provided, to determine the
  //             units of measure would be far more reliable.
  //
  //           See:
  //             a) https://developers.google.com/transit/gtfs/reference#shapestxt
  //             b) https://developers.google.com/transit/gtfs/reference#stop_timestxt
  //
  const lastDistTraveled = _.last(seq).shape_dist_traveled;

  if (!Number.isFinite(lastDistTraveled)) {
    stopsSeq.forEach(trip_stop => {
      trip_stop.shape_dist_traveled = null;
    });
    return stopsSeq;
  }

  const mi = turf.length(shape, { units: MILES });
  const ft = mi * 5280;

  const km = turf.length(shape, { units: KILOMETERS });
  const m = km * 1000;

  const closest = _.sortBy([mi, ft, km, m], x =>
    Math.abs(lastDistTraveled - x)
  );

  if (closest === mi) {
    seq.forEach(s => {
      s.shape_dist_traveled *= 1.60934;
    });

    return stopsSeq;
  }

  if (closest === ft) {
    seq.forEach(s => {
      s.shape_dist_traveled *= 1.60934 / 5280;
    });
  }

  if (closest === m) {
    seq.forEach(s => {
      s.shape_dist_traveled /= 1000;
    });
  }

  const lastDistTraveledKm = _.last(seq).shape_dist_traveled;

  if (Math.abs((lastDistTraveled - lastDistTraveledKm) / km) > 0.1) {
    throw new Error(
      `Unit conversion fail. Turf says ${km}. Converted dist = ${lastDistTraveledKm}`
    );
  }

  // Sometimes the first entry is null.
  seq[0].shape_dist_traveled = seq[0].shape_dist_traveled || 0;

  return seq;
};

/**
 * NOTE: Excludes shapes with no stops due to INNER JOIN.
 */
function* makeShapesWithStopsIterator() {
  db.attachDatabase(RAW_GTFS_SCHEMA);

  // NOTE: SQLite does NOT guarantee ordering within group_concat.
  //   See: https://stackoverflow.com/questions/1897352/sqlite-group-concat-ordering
  const iterQuery = db.prepare(`
    SELECT
        shape_feature,
        stop_features,
        stop_sequences
      FROM (
        -- GeoJSON features
        SELECT
            trips.shape_id,
            geojson_shapes.feature AS shape_feature,
            (
              '[' ||
              group_concat( DISTINCT geojson_stops.feature ) ||
              ']'
            ) AS stop_features
          FROM ${RAW_GTFS_SCHEMA}.trips AS trips
            INNER JOIN ${RAW_GTFS_SCHEMA}.stop_times USING (trip_id)
            INNER JOIN ${GEOJSON_SCHEMA}.stops AS geojson_stops ON (stop_times.stop_id = geojson_stops.id)
            INNER JOIN ${GEOJSON_SCHEMA}.shapes AS geojson_shapes ON (trips.shape_id = geojson_shapes.id)
          -- GROUP BY geojson_shapes.feature -- Was there a reason why I had this instead of the following...
          GROUP BY geojson_shapes.feature
      ) AS geojson_features_subquery INNER JOIN (
        -- Scheduled stop sequences for the shape.
        SELECT
            shape_id,
            -- NOTE:
            --       Try to get the unique ordered lists of stop_seq_obj.
            --         This is STRICTLY to reduce result set size because
            --           SQLite does NOT guarantee ordering within group_concat!
            --         Therefore, we MUST ensure ordering using JS below.
            (
              '[' ||
              group_concat( DISTINCT stop_seq_obj ) ||
              ']'
            ) AS stop_sequences
          FROM (
            SELECT
                shape_id,
                trip_id,
                json_group_object(  -- NOTE: Ordering by stop_sequence is NOT guaranteed by SQLite.
                  stop_sequence,             -- The relative "index" of the stop along the trip
                  json_object(               -- The trip stop info.
                    'stop_id',
                    stop_id,
                    'shape_dist_traveled',
                    shape_dist_traveled
                  )
                ) AS stop_seq_obj
              FROM (
                SELECT
                    shape_id,
                    trip_id,
                    stop_sequence,
                    shape_dist_traveled,
                    stop_id
                  FROM ${RAW_GTFS_SCHEMA}.trips
                    INNER JOIN ${RAW_GTFS_SCHEMA}.stop_times USING (trip_id)
                  ORDER BY shape_id, trip_id, stop_sequence
              ) AS ordered_stop_seq
              GROUP BY shape_id, trip_id
          ) AS stop_seq_objs
          GROUP BY shape_id
          -- LIMIT 1
      ) AS stop_sequences_along_shape_subquery USING (shape_id) ;
  `);

  const iter = iterQuery.raw().iterate();

  for (const [shapeFeatureStr, stopFeaturesArr, stopSeqArrs] of iter) {
    const shape = JSON.parse(shapeFeatureStr);
    const stops = JSON.parse(stopFeaturesArr);

    // Get the unique set of ORDERED stop sequences.
    //   Stop sequence ordering now GUARANTEED.
    const stopSeqs = _.uniqWith(
      JSON.parse(stopSeqArrs).map(
        stopSeq =>
          Object.keys(stopSeq)
            .sort((seq_num_a, seq_num_b) => +seq_num_a - +seq_num_b) // Sort (stop_sequences col) as numbers
            .map(seqNum => stopSeq[seqNum]) // output array of { stop_id, shape_dist_traveled } in seq order
      ),
      _.isEqual // remove dupes
    ).sort((a, b) => b.length - a.length); // sort in descending order by seq length

    const [longestSeq] = stopSeqs;

    // Filter out any of the remaining stop sequences
    //   if they are subsequences of the longest
    const nonSubSeqs = stopSeqs.slice(1).filter(seq => {
      const n = seq.length;
      let i = 0;

      for (let j = 0; i < n && j < longestSeq.length; ++j) {
        if (_.isEqual(seq[i], longestSeq[j])) {
          ++i;
        }
      }

      // If is subsequence, filter it out. Otherwise, keep.
      return i !== n;
    });

    // TODO: Document this in GitHub issues.
    // INVARIANT: only one stop sequence after filtering subsequences
    //   Passes for all of NYS's GTFS.
    if (nonSubSeqs.length > 0) {
      throw new Error(`
        INVARIANT BROKEN:

          Currently the makeShapesWithStopsIterator can only handle
            shapes with single authoriative stop sequence.

          Therefore, if a shape does NOT have a single stop sequence
            that includes ALL the stops of any other stop sequence,
            it cannot output a (shape, stops[]) pair.

          To remedy this limitation would require merging stop sequences.
            This algo would be simple if the stop_times table has reliable
              shape_dist_traveled column values.
            Otherwise, we would have to fallback to spatial algos and
              the uncertainty that they entail.

          Since currently all NYS GTFS files pass this invariant,
            remedying this limitation is not a priority.
      `);
    }

    const stopsById = stops.reduce((acc, stop) => {
      const {
        properties: { stop_id }
      } = stop;

      acc[stop_id] = stop;

      return acc;
    }, {});

    // Per the GTFS spec, there is no standard unit for shape_dist_traveled.
    //   Therefore, we need to convert to kilometers.
    const seq = convertStopsShapeDistTraveledToKilometers(shape, longestSeq);

    const shapeLen = turf.length(shape);

    const stopsArr = seq.map(({ stop_id, shape_dist_traveled }) => {
      // Since stops may occur more than once,
      //   we need to return copies of the stop feature.
      // Each copy has shape_dist_traveled added to its properties.
      // We don't use deepClone because geoms do not change.
      const stop = { ...stopsById[stop_id] };

      stop.properties = { ...stop.properties };
      stop.properties.shape_dist_traveled =
        shape_dist_traveled && Math.min(shape_dist_traveled, shapeLen);

      return stop;
    });

    // TODO: Either make this a database FOREIGN KEY constraint,
    //         or handle it by logging the INVARIANT violation
    //         and moving on to the next shape.
    if (stopsArr.some(stop => _.isNil(stop))) {
      throw new Error("Stops from stop_trips not in stops table.");
    }

    yield { shape, stops: stopsArr };
  }
}

function makeStopsIterator() {
  const stopsIteratorQuery = db.prepare(`
    SELECT
        feature
      FROM ${GEOJSON_SCHEMA}.stops ;`);

  const iter = stopsIteratorQuery.raw().iterate();
  return toParsedFeaturesIterator(iter);
}

function makeShapesIterator() {
  const stopsIteratorQuery = db.prepare(`
    SELECT
        feature
      FROM ${GEOJSON_SCHEMA}.shapes
    ; `);

  const iter = stopsIteratorQuery.raw().iterate();
  return toParsedFeaturesIterator(iter);
}

module.exports = {
  makeStopsIterator,
  makeShapesIterator,
  makeShapesWithStopsIterator
};
