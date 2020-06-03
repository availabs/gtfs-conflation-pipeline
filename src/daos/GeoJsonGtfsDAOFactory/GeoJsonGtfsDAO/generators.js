/* eslint-disable no-restricted-syntax, jsdoc/require-jsdoc */

const _ = require('lodash');

const db = require('../../../services/DbService');

const toParsedFeaturesIterator = require('../../../utils/toParsedFeaturesIterator');

const RawGtfsDAOFactory = require('../../RawGtfsDAOFactory');

const {
  RAW_GTFS: RAW_GTFS_SCHEMA
} = require('../../../constants/databaseSchemaNames');

const GEOJSON_SCHEMA = require('./DATABASE_SCHEMA_NAME');

function* makeTripsIterator() {
  const rawGtfsDAO = RawGtfsDAOFactory.getDAO();

  const tripsTableColumnList = rawGtfsDAO.listColumnsForTable('trips');

  if (!tripsTableColumnList) {
    throw new Error(
      `No columns list available for the ${RAW_GTFS_SCHEMA}.trips table. Has it been loaded?`
    );
  }

  const tripsIteratorQuery = db.prepare(`
    SELECT
        json_object(

          'id',
          trips.trip_id,

          'type',
          'Feature',

          'properties',
          json_object(
            'shape_id',
            trips.shape_id,

            'route_id',
            trips.route_id,

            'service_id',
            trips.service_id,

            'trip_id',
            trips.trip_id,

            -- NOTE: SQLite does not guarantee ordering. MUST sort in JS.
            'stops_list',
            (
              '[' ||
              group_concat(
                json_patch(
                  geojson_stops.feature,
                  json_object(
                    'properties',
                    json_object(
                      'stop_sequence',
                      stop_times.stop_sequence
                    )
                  )
                )
              ) ||
              ']'
            )
          ),

          'geometry',
          json_object(
            'type',
            'LineString',

            'coordinates',
            json_extract(
              geojson_shapes.feature,
              '$.geometry.coordinates'
            )
          )

        ) AS feature
      FROM ${RAW_GTFS_SCHEMA}.trips AS trips
        INNER JOIN ${RAW_GTFS_SCHEMA}.stop_times USING (trip_id)
        INNER JOIN ${GEOJSON_SCHEMA}.stops AS geojson_stops ON (stop_times.stop_id = geojson_stops.id)
        INNER JOIN ${GEOJSON_SCHEMA}.shapes AS geojson_shapes ON (trips.shape_id = geojson_shapes.id)
      GROUP BY trips.trip_id, trips.route_id, trips.service_id, geojson_shapes.feature
      ORDER BY
        trips.route_id, trips.trip_id ;
  `);

  const iter = tripsIteratorQuery.raw().iterate();

  for (const [row] of iter) {
    const feature = JSON.parse(row);

    feature.properties.stops_list = _.sortBy(
      JSON.parse(feature.properties.stops_list),
      'properties.stop_sequence'
    );

    yield feature;
  }
}

function makeStopsIterator() {
  const stopsIteratorQuery = db.prepare(`
    SELECT
        feature
      FROM ${GEOJSON_SCHEMA}.stops
      ORDER BY geoprox_key ;`);

  const iter = stopsIteratorQuery.raw().iterate();
  return toParsedFeaturesIterator(iter);
}

function makeShapesIterator() {
  const stopsIteratorQuery = db.prepare(`
    SELECT
        feature
      FROM ${GEOJSON_SCHEMA}.shapes
      ORDER BY geoprox_key ;`);

  const iter = stopsIteratorQuery.raw().iterate();
  return toParsedFeaturesIterator(iter);
}

module.exports = {
  makeStopsIterator,
  makeShapesIterator,
  makeTripsIterator
};
