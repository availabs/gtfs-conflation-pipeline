/* eslint-disable no-restricted-syntax, jsdoc/require-jsdoc */

const assert = require('assert');

const turf = require('@turf/turf');

const logger = require('../../services/Logger');

const RawGtfsDAOFactory = require('../../daos/RawGtfsDAOFactory');
const GeoJsonGtfsDAOFactory = require('../../daos/GeoJsonGtfsDAOFactory');

function* toPointsIterator(gtfsStopsIterator) {
  for (const { stop_id, stop_lat, stop_lon } of gtfsStopsIterator) {
    yield turf.point([stop_lon, stop_lat], null, { id: stop_id });
  }
}

function* toLineStringsIterator(gtfsShapesIterator) {
  let curShapeId = null;
  let curShapePtSeq = null;
  let coordinates;

  for (const {
    shape_id,
    shape_pt_lat,
    shape_pt_lon,
    shape_pt_sequence
  } of gtfsShapesIterator) {
    if (curShapeId) {
      if (curShapeId === shape_id) {
        assert(
          (curShapePtSeq === null && shape_pt_sequence === null) ||
            curShapePtSeq <= shape_pt_sequence
        );
      } else {
        assert(curShapeId < shape_id);
      }
    }

    // FIXME: Clean this
    if (!curShapeId || curShapeId !== shape_id) {
      if (curShapeId && coordinates && coordinates.length > 1) {
        yield turf.lineString(coordinates, null, { id: curShapeId });
      }

      curShapeId = shape_id;
      curShapePtSeq = shape_pt_sequence;
      coordinates = [[shape_pt_lon, shape_pt_lat]];
    } else {
      coordinates.push([shape_pt_lon, shape_pt_lat]);
    }
  }

  if (curShapeId && coordinates && coordinates.length > 1) {
    yield turf.lineString(
      coordinates,
      { shape_id: curShapeId },
      { id: curShapeId }
    );
  }
}

const loadStopPoints = (rawGtfsDAO, geoJsonGtfsDAO) => {
  logger.time('stops as geojson');
  const stopsIterator = rawGtfsDAO.makeStopsIterator();
  const pointsIterator = toPointsIterator(stopsIterator);

  geoJsonGtfsDAO.loadStops(pointsIterator, { clean: true });
  logger.timeEnd('stops as geojson');
};

const loadShapeLineStrings = (rawGtfsDAO, geoJsonGtfsDAO) => {
  logger.time('shapes as geojson');
  const shapesIterator = rawGtfsDAO.makeShapesIterator();
  const lineStringsIterator = toLineStringsIterator(shapesIterator);

  geoJsonGtfsDAO.loadShapes(lineStringsIterator, { clean: true });
  logger.timeEnd('shapes as geojson');
};

const main = async () => {
  try {
    const rawGtfsDAO = RawGtfsDAOFactory.getDAO();
    const geoJsonGtfsDAO = GeoJsonGtfsDAOFactory.getDAO();

    loadStopPoints(rawGtfsDAO, geoJsonGtfsDAO);
    loadShapeLineStrings(rawGtfsDAO, geoJsonGtfsDAO);
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
};

module.exports = main;
