/* eslint-disable no-restricted-syntax, jsdoc/require-jsdoc */

const turf = require('@turf/turf');
const gdal = require('gdal');

const {
  GEOJSON_GTFS,
  GTFS_NETWORK
} = require('../../../constants/databaseSchemaNames');

// const supportedLayers = [GEOJSON_GTFS, GTFS_NETWORK];
const supportedLayers = [GEOJSON_GTFS];

const GeoJsonGtfsDAOFactory = require('../../GeoJsonGtfsDAOFactory');
const GtfsNetworkDAOFactory = require('../../GtfsNetworkDAOFactory');

const wgs84 = gdal.SpatialReference.fromEPSG(4326);

const addFieldToLayer = (layer, name, type) =>
  layer.fields.add(new gdal.FieldDefn(name, type));

const addGeoJsonStopsLayer = dataset => {
  const layer = dataset.layers.create(
    `${GEOJSON_GTFS}_stops`,
    wgs84,
    gdal.Point
  );

  const fieldDefinitionPairs = [
    ['stop_id', gdal.OFTString],
    ['stop_code', gdal.OFTString],
    ['stop_name', gdal.OFTString],
    ['stop_desc', gdal.OFTString],
    ['stop_lat', gdal.OFTReal],
    ['stop_lon', gdal.OFTReal],
    ['zone_id', gdal.OFTString],
    ['stop_url', gdal.OFTString],
    ['location_type', gdal.OFTInteger],
    ['stop_timezone', gdal.OFTString],
    ['wheelchair_boarding', gdal.OFTInteger]
  ];

  for (const [name, type] of fieldDefinitionPairs) {
    addFieldToLayer(layer, name, type);
  }

  const dao = GeoJsonGtfsDAOFactory.getDAO();

  const iter = dao.makeStopsIterator();

  for (const geojsonPoint of iter) {
    const gdalFeature = new gdal.Feature(layer);

    Object.keys(geojsonPoint.properties).forEach(prop =>
      gdalFeature.fields.set(prop, geojsonPoint.properties[prop])
    );

    const [lon, lat] = turf.getCoord(geojsonPoint);
    const point = new gdal.Point(lon, lat);

    gdalFeature.setGeometry(point);

    layer.features.add(gdalFeature);
  }
};

const addGeoJsonShapesLayer = dataset => {
  const layer = dataset.layers.create(
    `${GEOJSON_GTFS}_shapes`,
    wgs84,
    gdal.LineString
  );

  addFieldToLayer(layer, 'shape_id', gdal.OFTString);

  const dao = GeoJsonGtfsDAOFactory.getDAO();

  const iter = dao.makeShapesIterator();

  for (const geojsonLineString of iter) {
    const gdalFeature = new gdal.Feature(layer);

    gdalFeature.fields.set('shape_id', geojsonLineString.properties.id);

    const lineString = new gdal.LineString();

    turf
      .getCoords(geojsonLineString)
      .forEach(([lon, lat]) => lineString.points.add(new gdal.Point(lon, lat)));

    gdalFeature.setGeometry(lineString);

    layer.features.add(gdalFeature);
  }
};

const addGtfsNetworkLayer = dataset => {
  const layer = dataset.layers.create(
    `${GTFS_NETWORK}_shape_segments`,
    wgs84,
    gdal.LineString
  );

  const fieldDefinitionPairs = [
    ['shape_id', gdal.OFTString],
    ['shape_idx', gdal.OFTInteger],
    ['from_stops', gdal.OFTString],
    ['to_stops', gdal.OFTString],
    ['start_dist', gdal.OFTReal],
    ['stop_dist', gdal.OFTReal]
  ];

  for (const [name, type] of fieldDefinitionPairs) {
    addFieldToLayer(layer, name, type);
  }

  const dao = GtfsNetworkDAOFactory.getDAO();

  const iter = dao.makeShapeSegmentsIterator();

  for (const geojsonLineString of iter) {
    const gdalFeature = new gdal.Feature(layer);

    Object.keys(geojsonLineString.properties).forEach(prop => {
      const fieldName = prop
        .replace(/^shape_index$/, 'shape_idx')
        .replace(/^from_stop_ids$/, 'from_stops')
        .replace(/^to_stop_ids$/, 'to_stops');

      gdalFeature.fields.set(
        fieldName,
        `${geojsonLineString.properties[prop]}`
      );
    });

    const lineString = new gdal.LineString();

    turf
      .getCoords(geojsonLineString)
      .forEach(([lon, lat]) => lineString.points.add(new gdal.Point(lon, lat)));

    gdalFeature.setGeometry(lineString);

    layer.features.add(gdalFeature);
  }
};

function outputShapefile(output_file) {
  // let layersArr;

  // // If none specified, do all.
  // if (!layers) {
  // layersArr = supportedLayers;
  // } else {
  // layersArr = Array.isArray(layers) ? layers : [layers];
  // for (const layer of layers) {
  // if (!supportedLayers.includes(layer)) {
  // throw new Error(`Unrecognized layer: ${layer}`);
  // }
  // }
  // }

  if (!output_file) {
    throw new Error('The output_file parameter is required');
  }

  const dataset = gdal.open(output_file, 'w', 'ESRI Shapefile');

  if (supportedLayers.includes(GEOJSON_GTFS)) {
    addGeoJsonStopsLayer(dataset);
    addGeoJsonShapesLayer(dataset);
    addGtfsNetworkLayer(dataset);
  }

  dataset.close();
}

module.exports = {
  outputShapefile
};
