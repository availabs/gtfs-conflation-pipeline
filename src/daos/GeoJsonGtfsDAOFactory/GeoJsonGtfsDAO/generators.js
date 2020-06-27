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

  // https://stackoverflow.com/questions/1897352/sqlite-group-concat-ordering
  const iterQuery = db.prepare(`
    SELECT
        shape_feature,
        stop_features,
        stop_sequences
      FROM (
        -- The shape and stop GeoJSON Features
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
          GROUP BY geojson_shapes.feature
      ) AS features INNER JOIN (
        -- The stop sequences
        SELECT
            shape_id,
            (
              '[' ||
              group_concat( DISTINCT stop_seq ) ||
              ']'
            ) AS stop_sequences
          FROM (
            SELECT
                shape_id,
                trip_id,
                json_group_object(
                  stop_sequence,
                  json_object(
                    'stop_id',
                    stop_id,
                    'shape_dist_traveled',
                    shape_dist_traveled
                  )
                ) AS stop_seq
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
      ) AS sequences USING (shape_id) ; `);

  const iter = iterQuery.raw().iterate();

  for (const [shapeFeatureStr, stopFeaturesArr, stopSeqArrs] of iter) {
    const shape = JSON.parse(shapeFeatureStr);
    const stops = JSON.parse(stopFeaturesArr);

    const stopSeqs = _.uniqWith(
      JSON.parse(stopSeqArrs).map(
        stopSeq =>
          Object.keys(stopSeq)
            .sort((a, b) => +a - +b) // Sort keys (stop_sequences col) as numbers
            .map(seqNum => stopSeq[seqNum]) // output { stop_id, shape_dist_traveled } array in seq order
      ),
      _.isEqual // remove dupes
    ).sort((a, b) => b.length - a.length); // sort by seq length

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

    // INVARIANT: only one stop sequence after filtering subsequences
    //   Passes for all of NYS's GTFS.
    if (nonSubSeqs.length > 0) {
      throw new Error("TODO: Merge stop sequences.");
    }

    const stopsById = stops.reduce((acc, stop) => {
      const {
        properties: { stop_id }
      } = stop;

      acc[stop_id] = stop;

      return acc;
    }, {});

    const seq = convertStopsShapeDistTraveledToKilometers(shape, longestSeq);

    const shapeLen = turf.length(shape);

    const stopsArr = seq.map(({ stop_id, shape_dist_traveled }) => {
      // Since stops may occur more than once, we need to
      //   immutably update properties.
      //   We don't want to unnecessarily deepClone
      const stop = { ...stopsById[stop_id] };

      stop.properties = { ...stop.properties };
      stop.properties.shape_dist_traveled =
        shape_dist_traveled && Math.min(shape_dist_traveled, shapeLen);

      return stop;
    });

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
