/* eslint-disable no-restricted-syntax, jsdoc/require-jsdoc */

const { existsSync } = require("fs");

const turf = require("@turf/turf");
const gdal = require("gdal");
const _ = require("lodash");

const {
  GEOJSON_GTFS,
  GTFS_NETWORK
} = require("../../../constants/databaseSchemaNames");

// const supportedLayers = [GEOJSON_GTFS, GTFS_NETWORK];
const supportedLayers = [GEOJSON_GTFS];

const GeoJsonGtfsDAOFactory = require("../../GeoJsonGtfsDAOFactory");
const GtfsNetworkDAOFactory = require("../../GtfsNetworkDAOFactory");

const wgs84 = gdal.SpatialReference.fromEPSG(4326);

const addFieldToLayer = (layer, name, type) =>
  layer.fields.add(new gdal.FieldDefn(name, type));

const addGeoJsonStopsLayer = dataset => {
  const layer = dataset.layers.create(
    `${GEOJSON_GTFS}_stops`,
    wgs84,
    gdal.Point
  );

  const propDefs = {
    stop_id: {
      fieldName: "stop_id",
      type: gdal.OFTString
    },
    stop_code: {
      fieldName: "stop_code",
      type: gdal.OFTString
    },
    stop_name: {
      fieldName: "stop_name",
      type: gdal.OFTString
    },
    stop_desc: {
      fieldName: "stop_desc",
      type: gdal.OFTString
    },
    stop_lat: {
      fieldName: "stop_lat",
      type: gdal.OFTReal
    },
    stop_lon: {
      fieldName: "stop_lon",
      type: gdal.OFTReal
    },
    zone_id: {
      fieldName: "zone_id",
      type: gdal.OFTString
    },
    stop_url: {
      fieldName: "stop_url",
      type: gdal.OFTString
    },
    location_type: {
      fieldName: "loc_type",
      type: gdal.OFTString
    },
    stop_timezone: {
      fieldName: "stop_tmzn",
      type: gdal.OFTString
    },
    wheelchair_boarding: {
      fieldName: "wchair_bdn",
      type: gdal.OFTReal
    }
  };

  _.forEach(propDefs, ({ type, fieldName }) =>
    addFieldToLayer(layer, fieldName, type)
  );

  const fieldDefinitionPairs = [];

  for (const [name, type] of fieldDefinitionPairs) {
    addFieldToLayer(layer, name, type);
  }

  const dao = GeoJsonGtfsDAOFactory.getDAO();

  const iter = dao.makeStopsIterator();

  for (const geojsonPoint of iter) {
    const gdalFeature = new gdal.Feature(layer);

    Object.keys(geojsonPoint.properties).forEach(prop => {
      if (!propDefs[prop]) {
        return;
      }

      const { fieldName } = propDefs[prop];

      const v = geojsonPoint.properties[prop];

      gdalFeature.fields.set(fieldName, _.isNil(v) ? null : JSON.stringify(v));
    });

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

  addFieldToLayer(layer, "shape_id", gdal.OFTString);

  const dao = GeoJsonGtfsDAOFactory.getDAO();

  const iter = dao.makeShapesIterator();

  for (const geojsonLineString of iter) {
    const gdalFeature = new gdal.Feature(layer);

    gdalFeature.fields.set("shape_id", geojsonLineString.properties.id);

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
    ["shape_id", gdal.OFTString],
    ["shape_idx", gdal.OFTInteger],
    ["from_stops", gdal.OFTString],
    ["to_stops", gdal.OFTString],
    ["start_dist", gdal.OFTReal],
    ["stop_dist", gdal.OFTReal]
  ];

  const definedFields = fieldDefinitionPairs.map(([field]) => field);

  for (const [name, type] of fieldDefinitionPairs) {
    addFieldToLayer(layer, name, type);
  }

  const dao = GtfsNetworkDAOFactory.getDAO();

  const iter = dao.makeShapeSegmentsIterator();

  for (const geojsonLineString of iter) {
    const gdalFeature = new gdal.Feature(layer);

    Object.keys(geojsonLineString.properties).forEach(prop => {
      const fieldName = prop
        .replace(/^shape_index$/, "shape_idx")
        .replace(/^from_stop_ids$/, "from_stops")
        .replace(/^to_stop_ids$/, "to_stops");

      if (definedFields.includes(fieldName)) {
        const v = geojsonLineString.properties[prop];

        gdalFeature.fields.set(
          fieldName,
          _.isNil(v) ? null : JSON.stringify(v)
        );
      }
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
    console.error("The output_file parameter is required");
    process.exit(1);
  }

  if (existsSync(output_file)) {
    console.error(`You must first remove the output file ${output_file}.`);
    process.exit(1);
  }

  const dataset = gdal.open(output_file, "w", "ESRI Shapefile");

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
