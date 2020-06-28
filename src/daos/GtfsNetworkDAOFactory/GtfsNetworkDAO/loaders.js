/* eslint-disable no-restricted-syntax, jsdoc/require-jsdoc, no-continue */

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

const db = require("../../../services/DbService");
const GeoJsonGtfsDAOFactory = require("../../GeoJsonGtfsDAOFactory");

const SCHEMA = require("./DATABASE_SCHEMA_NAME");

const { createShapeSegmentsTable } = require("./createTableFns");

const roundGeometryCoordinates = require("../../../utils/roundGeometryCoordinates");
const getGeoProximityKey = require("../../../utils/getGeoProximityKey");

const SNAP_DIST_THRESHOLD = 20 / 1000; /* 20 meters */

const getStopSnappedDistancesAlongShape = (shapeLineString, stopPointsSeq) => {
  const {
    properties: { shape_id }
  } = shapeLineString;

  // console.log("shape_id:", shape_id);

  // console.log(
  // JSON.stringify(
  // { stopsSeq: stopPointsSeq.map(stop => _.omit(stop, "geometry")) },
  // null,
  // 4
  // )
  // );

  // stopPointsSeq.forEach((_$, i) => {
  // if (stopPointsSeq[i - 1] === stopPointsSeq[i]) {
  // const {
  // properties: { stop_id }
  // } = stopPointsSeq[i - 1];

  // console.log(JSON.stringify({ shapeLineString, stopPointsSeq }, null, 4));

  // throw new Error(
  // `INVARIANT BROKEN. Self loop in shape ${shape_id} for stop ${stop_id}`
  // );
  // }
  // });
  // console.log(JSON.stringify(stopPointsSeq, null, 4));

  if (
    stopPointsSeq.every(({ properties: { shape_dist_traveled } }) =>
      Number.isFinite(shape_dist_traveled)
    )
  ) {
    const orderedSnaps = stopPointsSeq.map(
      ({ properties: { stop_id, shape_dist_traveled } }) => ({
        stop_id,
        dist_along: shape_dist_traveled
      })
    );

    return orderedSnaps;
  }

  const stopIdToStopSeqIdxs = stopPointsSeq.reduce(
    (acc, { properties: { stop_id } }, i) => {
      acc[stop_id] = acc[stop_id] || [];
      acc[stop_id].push(i);
      return acc;
    },
    {}
  );

  const singleOccurranceStops = stopPointsSeq.filter(
    ({ properties: { stop_id } }) => stopIdToStopSeqIdxs[stop_id].length === 1
  );

  // console.log(
  // JSON.stringify({ stopIdToStopSeqIdxs, singleOccurranceStops }, null, 4)
  // );

  if (singleOccurranceStops.length === 0) {
    throw new Error(`No single occurance stops for shape ${shape_id}.`);
  }

  const shapeLen = turf.length(shapeLineString);

  // Parallel array with stopPointsSeq
  const snapDistsAlong = _.fill(new Array(stopPointsSeq.length), null);

  for (const stop of singleOccurranceStops) {
    const {
      properties: { stop_id }
    } = stop;

    const snappedPoint = turf.nearestPointOnLine(shapeLineString, stop);
    let {
      properties: { location: dist_along }
    } = snappedPoint;

    // Use Trip LineString start or end point if the snapped point
    //   is within the SNAP_DIST_THRESHOLD
    if (dist_along <= SNAP_DIST_THRESHOLD) {
      dist_along = 0;
    } else if (shapeLen - dist_along < SNAP_DIST_THRESHOLD) {
      dist_along = shapeLen;
    }

    // sparsely fill snapDistsAlong
    const [stopSeqIdx] = stopIdToStopSeqIdxs[stop_id];
    snapDistsAlong[stopSeqIdx] = dist_along;
  }

  // FIXME: Heuristic. Need better edge case handing.
  // Fix out of order snaps
  let segStart = 0;
  for (let i = 1; i < snapDistsAlong.length; ++i) {
    const curDistAlong = snapDistsAlong[i];

    // console.log("segStart:", segStart, "| curDistAlong:", curDistAlong, "| stopId:", stopPointsSeq[i]);

    // console.log(JSON.stringify({ segStart, curDistAlong }, null, 4));
    if (curDistAlong < segStart) {
      // console.log("OUT OF ORDER");
      // Find the next defined dist along to use as the segment stopDist
      let segEnd = shapeLen;
      for (let j = i + 1; j < snapDistsAlong.length; ++j) {
        // Can't look for strictly greater than because
        //   then we potentially introduce backtracking again.
        if (snapDistsAlong[j] >= segStart) {
          segEnd = snapDistsAlong[j];
          break;
        }
      }

      if (segStart === segEnd) {
        if (segStart <= SNAP_DIST_THRESHOLD) {
          snapDistsAlong[i] = 0;
        } else if (shapeLen - segStart < SNAP_DIST_THRESHOLD) {
          snapDistsAlong[i] = shapeLen;
        } else {
          snapDistsAlong[i] = segStart;
        }

        segStart = snapDistsAlong[i];
        continue;
      }

      let seg;
      try {
        seg = turf.lineSliceAlong(shapeLineString, segStart, segEnd);
      } catch (err) {
        console.log(JSON.stringify({ segStart, segEnd }, null, 4));
        console.error(err);
        process.exit(1);
      }

      const stop = stopPointsSeq[i];
      const snappedPoint = turf.nearestPointOnLine(seg, stop);
      let {
        properties: { location: dist_along }
      } = snappedPoint;

      dist_along += segStart;
      // console.log(JSON.stringify({ segStart, segEnd, i, dist_along }, null, 4));

      // Use Trip LineString start or end point if the snapped point
      //   is within the SNAP_DIST_THRESHOLD
      if (dist_along <= SNAP_DIST_THRESHOLD) {
        dist_along = 0;
      } else if (shapeLen - dist_along < SNAP_DIST_THRESHOLD) {
        dist_along = shapeLen;
      }

      snapDistsAlong[i] = dist_along;
      segStart = dist_along;
    } else {
      segStart = curDistAlong;
    }
  }

  // console.log(JSON.stringify({ snapDistsAlong }, null, 4));

  // Fill in the potentially sparse snapDistsAlong array
  segStart = 0;
  for (let i = 0; i < snapDistsAlong.length; ++i) {
    const curDistAlong = snapDistsAlong[i];

    if (curDistAlong === null) {
      // Find the next defined dist along to use as the segment stopDist
      let segEnd = shapeLen;
      for (let j = i + 1; j < snapDistsAlong.length; ++j) {
        if (snapDistsAlong[j] !== null) {
          segEnd = snapDistsAlong[j];
          break;
        }
      }

      const seg = turf.lineSliceAlong(shapeLineString, segStart, segEnd);

      const stop = stopPointsSeq[i];
      const snappedPoint = turf.nearestPointOnLine(seg, stop);
      let {
        properties: { location: dist_along }
      } = snappedPoint;

      dist_along += segStart;
      // console.log(JSON.stringify({ segStart, segEnd, i, dist_along }, null, 4));

      // Use Trip LineString start or end point if the snapped point
      //   is within the SNAP_DIST_THRESHOLD
      if (dist_along <= SNAP_DIST_THRESHOLD) {
        dist_along = 0;
      } else if (shapeLen - dist_along < SNAP_DIST_THRESHOLD) {
        dist_along = shapeLen;
      }

      snapDistsAlong[i] = dist_along;
      segStart = dist_along;
    } else {
      segStart = curDistAlong;
    }
  }

  const orderedSnaps = stopPointsSeq.map(({ properties: { stop_id } }, i) => ({
    stop_id,
    dist_along: snapDistsAlong[i]
  }));

  return orderedSnaps;
};

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

  const { dist_along: startDistAlong } = _.first(orderedSnaps) || {};
  let { dist_along: endDistAlong } = _.last(orderedSnaps) || {};

  endDistAlong = Math.min(shapeLen, endDistAlong);

  if (startDistAlong !== 0) {
    orderedSnaps.unshift({ stop_id: null, dist_along: 0 });
  }

  if (endDistAlong !== shapeLen) {
    orderedSnaps.push({ stop_id: null, dist_along: shapeLen });
  }

  const headSnapGroup = {
    dist_along: 0,
    stop_ids: [_.head(orderedSnaps).stop_id]
  };

  const groupedSnaps = _.tail(orderedSnaps).reduce(
    (acc, { stop_id, dist_along }) => {
      const prevSnapGroup = _.last(acc);

      if (prevSnapGroup.dist_along === dist_along) {
        prevSnapGroup.stop_ids.push(stop_id);
      } else {
        acc.push({
          dist_along,
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
      const { stop_ids: from_stop_ids, dist_along: start_dist } = groupedSnaps[
        shape_index
      ];
      const { stop_ids: to_stop_ids, dist_along: stop_dist } = groupedSnaps[
        shape_index + 1
      ];

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
