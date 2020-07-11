/* eslint-disable no-restricted-syntax, jsdoc/require-jsdoc, no-continue, no-param-reassign */

// raw_gtfs> select trip_id, arrival_time, departure_time, stop_id, stop_sequence
// >         from stop_times where stop_id = '00632' and trip_id = '5644017-SEP19-Albany-Weekday-01';
// +---------------------------------+--------------+----------------+---------+---------------+
// | trip_id                         | arrival_time | departure_time | stop_id | stop_sequence |
// +---------------------------------+--------------+----------------+---------+---------------+
// | 5644017-SEP19-Albany-Weekday-01 | 15:09:00     | 15:09:00       | 00632   | 1             |
// | 5644017-SEP19-Albany-Weekday-01 | 15:09:00     | 15:09:00       | 00632   | 2             |
// +---------------------------------+--------------+----------------+---------+---------------+
// 2 rows in set

const turf = require("@turf/turf");
const _ = require("lodash");

const db = require("../../../../services/DbService");
const GeoJsonGtfsDAOFactory = require("../../../GeoJsonGtfsDAOFactory");

const SCHEMA = require("../DATABASE_SCHEMA_NAME");

const { createShapeSegmentsTable } = require("../createTableFns");

const roundGeometryCoordinates = require("../../../../utils/roundGeometryCoordinates");
const getGeoProximityKey = require("../../../../utils/getGeoProximityKey");

const fitStopsToPath = require("./fitStopsToPath");

const segmentizeShapeLineString = shapeLineString =>
  turf.segmentReduce(
    shapeLineString,
    (acc, segment, _0, _1, _2, segment_idx) => {
      const prevSeg = _.last(acc);

      const {
        properties: {
          start_dist_along: prevSegDistAlong = 0,
          length_km: prevSegLength = 0
        } = {}
      } = prevSeg || {};

      acc.push({
        ...segment,
        properties: {
          segment_idx,
          length_km: turf.length(segment),
          start_dist_along: prevSegDistAlong + prevSegLength
        }
      });
      return acc;
    },
    []
  );

const getStopSnappedDistancesAlongShape = (shapeLineString, stopPointsSeq) =>
  fitStopsToPath(segmentizeShapeLineString(shapeLineString), stopPointsSeq);

let id = 0;

// Warning: mutates orderedSnaps
const insertSlicedShape = (shapeLineString, orderedSnaps) => {
  const snappedStopsInsertStmt = db.prepare(`
    INSERT INTO ${SCHEMA}.shape_segments (
      id,
      shape_id,
      shape_index,
      geoprox_key,
      feature
    ) VALUES (?, ?, ?, ?, ?);
  `);

  const { id: shape_id } = shapeLineString;

  const shapeLen = turf.length(shapeLineString);

  const { snapped_dist_along_km: startDistAlong } = _.first(orderedSnaps) || {};
  let { snapped_dist_along_km: endDistAlong } = _.last(orderedSnaps) || {};

  endDistAlong = Math.min(shapeLen, endDistAlong);

  if (startDistAlong !== 0) {
    orderedSnaps.unshift({ stop_id: null, snapped_dist_along_km: 0 });
  }

  if (endDistAlong !== shapeLen) {
    orderedSnaps.push({ stop_id: null, snapped_dist_along_km: shapeLen });
  }

  const headSnapGroup = {
    snapped_dist_along_km: 0,
    stop_ids: [_.head(orderedSnaps).stop_id]
  };

  const groupedSnaps = _.tail(orderedSnaps).reduce(
    (acc, { stop_id, snapped_dist_along_km }) => {
      const prevSnapGroup = _.last(acc);

      if (prevSnapGroup.snapped_dist_along_km === snapped_dist_along_km) {
        prevSnapGroup.stop_ids.push(stop_id);
      } else {
        acc.push({
          snapped_dist_along_km,
          stop_ids: [stop_id]
        });
      }

      return acc;
    },
    [headSnapGroup]
  );

  let prevSegEndCoords;

  for (
    let shape_index = 0;
    shape_index < groupedSnaps.length - 1;
    ++shape_index
  ) {
    try {
      const {
        stop_ids: from_stop_ids,
        snapped_dist_along_km: start_dist
      } = groupedSnaps[shape_index];
      const {
        stop_ids: to_stop_ids,
        snapped_dist_along_km: stop_dist
      } = groupedSnaps[shape_index + 1];

      let shapeSliceFeature;
      try {
        shapeSliceFeature = turf.lineSliceAlong(
          shapeLineString,
          start_dist,
          stop_dist
        );
      } catch (err) {
        console.log("==============================================");
        console.log(
          JSON.stringify(
            {
              shape_id,
              orderedSnaps,
              snaps: groupedSnaps[shape_index],
              shapeLen,
              start_dist,
              stop_dist
            },
            null,
            4
          )
        );
        console.log("==============================================");
        throw err;
      }

      shapeSliceFeature.id = id;

      shapeSliceFeature.properties = {
        id,
        shape_id,
        shape_index,
        from_stop_ids: _.uniq(from_stop_ids),
        to_stop_ids: _.uniq(to_stop_ids),
        start_dist: _.round(start_dist, 6),
        stop_dist: _.round(stop_dist, 6)
      };

      // Ensure connectivity
      if (shape_index !== 0) {
        shapeSliceFeature.geometry.coordinates[0] = prevSegEndCoords;
      }

      const geoProximityKey = getGeoProximityKey(shapeSliceFeature);

      roundGeometryCoordinates(shapeSliceFeature);

      snappedStopsInsertStmt.run([
        id,
        `${shape_id}`,
        `${shape_index}`,
        `${geoProximityKey}`,
        JSON.stringify(shapeSliceFeature)
      ]);

      ++id;

      prevSegEndCoords = _.last(turf.getCoords(shapeSliceFeature));
    } catch (err) {
      // console.log(JSON.stringify({ orderedSnaps }, null, 4));
      console.error(err);
      process.exit(1);
    }
  }
};

function load() {
  db.unsafeMode(true);

  try {
    db.exec("BEGIN");

    db.exec(`DROP TABLE IF EXISTS ${SCHEMA}.shape_segments; `);

    createShapeSegmentsTable(db);

    const geoJsonGtfsDAO = GeoJsonGtfsDAOFactory.getDAO();
    const iter = geoJsonGtfsDAO.makeShapesWithStopsIterator();

    for (const {
      shape: shapeLineString,
      stops: stopPointsSeq,
      stopSeq
    } of iter) {
      const orderedSnaps = getStopSnappedDistancesAlongShape(
        shapeLineString,
        stopPointsSeq,
        stopSeq
      );

      insertSlicedShape(shapeLineString, orderedSnaps);
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
  load
};
