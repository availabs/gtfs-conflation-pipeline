#!/usr/bin/env node

/* eslint-disable no-restricted-syntax, jsdoc/require-jsdoc */

const GEOJSON_SCHEMA = require("./DATABASE_SCHEMA_NAME");

const agency = process.argv[2];

db.exec(
  `ATTACH DATABASE '${join(
    __dirname,
    `../../../../output.1592933047/${agency}/sqlite/raw_gtfs`
  )}' AS raw_gtfs; `
);

db.exec(
  `ATTACH DATABASE '${join(
    __dirname,
    `../../../../output.1592933047/${agency}/sqlite/geojson_gtfs`
  )}' AS geojson_gtfs; `
);

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
          WHERE ( trips.trip_id = '5643223-SEP19-Albany-Weekday-01')
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
                  stop_id
                ) AS stop_seq
              FROM (
                SELECT
                    shape_id,
                    trip_id,
                    stop_sequence,
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
    JSON.parse(stopSeqArrs).map(stopSeq =>
      Object.keys(stopSeq)
        .sort((a, b) => +a - +b)
        .map(seqNum => stopSeq[seqNum])
    ),
    _.isEqual
  ).sort((a, b) => b.length - a.length);

  const [longestSeq] = stopSeqs;

  const nonSubSeqs = stopSeqs.slice(1).filter(seq => {
    const n = seq.length;
    let i = 0;

    for (let j = 0; i < n && j < longestSeq.length; ++j) {
      if (seq[i] === longestSeq[j]) {
        ++i;
      }
    }

    return i !== n;
  });

  if (nonSubSeqs.length > 0) {
    throw new Error("TODO: Merge stop sequences.");
  }

  console.log(JSON.stringify({ shape, stops, longestSeq }, null, 4));
  console.log(longestSeq.length);
}
