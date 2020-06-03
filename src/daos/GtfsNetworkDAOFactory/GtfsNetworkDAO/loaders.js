/* eslint-disable no-restricted-syntax, jsdoc/require-jsdoc, no-continue */

const turf = require('@turf/turf');
const _ = require('lodash');

const db = require('../../../services/DbService');
const GeoJsonGtfsDAOFactory = require('../../GeoJsonGtfsDAOFactory');

const SCHEMA = require('./DATABASE_SCHEMA_NAME');

const { createShapeSegmentsTable } = require('./createTableFns');

const getGeoProximityKey = require('../../../utils/getGeoProximityKey');

const SNAP_DIST_THRESHOLD = 20 / 1000; /* 20 meters */

const getSnaps = (shapeLineString, stopPointsArr) => {
  const shapeLen = turf.length(shapeLineString);

  const snaps = [];
  for (const stop of stopPointsArr) {
    const { id: stop_id = null } = stop;

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

    snaps.push({ stop_id, dist_along });
  }

  return snaps;
};

const insertSlicedShape = (shapeLineString, snaps) => {
  const snappedStopsInsertStmt = db.prepare(`
      INSERT INTO ${SCHEMA}.shape_segments (
        shape_id,
        shape_index,
        from_stop_id,
        to_stop_id,
        geoprox_key,
        feature
      ) VALUES (?, ?, ?, ?, ?, ?);
    `);

  const { id: shape_id } = shapeLineString;

  const shapeLen = turf.length(shapeLineString);

  const orderedSnaps = _.sortBy(snaps, 'dist_along');

  const { dist_along: startDistAlong } = _.first(orderedSnaps) || {};
  const { dist_along: endDistAlong } = _.last(orderedSnaps) || {};

  if (startDistAlong !== 0) {
    orderedSnaps.unshift({ stop_id: null, dist_along: 0 });
  }

  if (endDistAlong !== shapeLen) {
    orderedSnaps.push({ stop_id: null, dist_along: shapeLen });
  }

  let prevSegEndCoords;
  for (let i = 0; i < orderedSnaps.length - 1; ++i) {
    const { stop_id: from_stop_id, dist_along: start_dist } = orderedSnaps[i];
    const { stop_id: to_stop_id, dist_along: stop_dist } = orderedSnaps[i + 1];

    const shapeSliceLineString = turf.lineSliceAlong(
      shapeLineString,
      start_dist,
      stop_dist
    );

    shapeSliceLineString.properties = {
      shape_index: i,
      from_stop_id,
      to_stop_id,
      start_dist,
      stop_dist
    };

    // Ensure connectivity
    if (i !== 0) {
      shapeSliceLineString.geometry.coordinates[0] = prevSegEndCoords;
    }

    const geoProximityKey = getGeoProximityKey(shapeSliceLineString);

    snappedStopsInsertStmt.run([
      `${shape_id}`,
      `${i}`,
      `${from_stop_id}`,
      `${to_stop_id}`,
      `${geoProximityKey}`,
      JSON.stringify(shapeSliceLineString)
    ]);

    prevSegEndCoords = _.last(turf.getCoords(shapeSliceLineString));
  }
};

function load(opts) {
  const { clean } = opts;

  db.unsafeMode(true);

  try {
    db.exec('BEGIN');

    if (clean) {
      db.exec(`DROP TABLE IF EXISTS ${SCHEMA}.shape_segments;`);
    }

    createShapeSegmentsTable(db);

    const geoJsonGtfsDAO = GeoJsonGtfsDAOFactory.getDAO();
    const iter = geoJsonGtfsDAO.makeShapesWithStopsIterator();

    for (const { shape: shapeLineString, stops: stopPointsArr } of iter) {
      const snaps = getSnaps(shapeLineString, stopPointsArr);
      insertSlicedShape(shapeLineString, snaps);
    }

    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  } finally {
    db.unsafeMode(false);
  }
}

module.exports = {
  load
};
