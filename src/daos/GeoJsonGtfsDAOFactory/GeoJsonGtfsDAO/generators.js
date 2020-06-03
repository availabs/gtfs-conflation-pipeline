/* eslint-disable no-restricted-syntax, jsdoc/require-jsdoc */

const db = require('../../../services/DbService');

const toParsedFeaturesIterator = require('../../../utils/toParsedFeaturesIterator');

const {
  RAW_GTFS: RAW_GTFS_SCHEMA
} = require('../../../constants/databaseSchemaNames');

const GEOJSON_SCHEMA = require('./DATABASE_SCHEMA_NAME');

/**
 * NOTE: Excludes shapes with no stops due to INNER JOIN.
 */
function* makeShapesWithStopsIterator() {
  db.attachDatabase(RAW_GTFS_SCHEMA);

  const iterQuery = db.prepare(`
    SELECT
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
    ;
  `);

  const iter = iterQuery.raw().iterate();

  for (const [shapeFeatureStr, stopFeaturesArr] of iter) {
    const shape = JSON.parse(shapeFeatureStr);
    const stops = JSON.parse(stopFeaturesArr);

    yield { shape, stops };
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
      FROM ${GEOJSON_SCHEMA}.shapes ;`);

  const iter = stopsIteratorQuery.raw().iterate();
  return toParsedFeaturesIterator(iter);
}

module.exports = {
  makeStopsIterator,
  makeShapesIterator,
  makeShapesWithStopsIterator
};
