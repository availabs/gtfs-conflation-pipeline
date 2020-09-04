/* eslint-disable no-restricted-syntax, jsdoc/require-jsdoc */

const { existsSync } = require("fs");

const turf = require("@turf/turf");
const gdal = require("gdal");
const _ = require("lodash");

const {
  GEOJSON_GTFS,
  GTFS_NETWORK,
} = require("../../constants/databaseSchemaNames");

const GeoJsonGtfsDAO = require("../GeoJsonGtfsDAO");
const GtfsNetworkDAO = require("../GtfsNetworkDAO");
const GtfsOsmNetworkDAO = require("../GtfsOsmNetworkDAO");
const GtfsConflationMapJoinDAO = require("../GtfsConflationMapJoinDAO");

const wgs84 = gdal.SpatialReference.fromEPSG(4326);

const addFieldToLayer = (layer, name, type) =>
  layer.fields.add(new gdal.FieldDefn(name, type));

const addGeoJsonStopsLayer = (dataset) => {
  const layer = dataset.layers.create(
    `${GEOJSON_GTFS}_stops`,
    wgs84,
    gdal.Point
  );

  const propDefs = {
    stop_id: {
      fieldName: "stop_id",
      type: gdal.OFTString,
    },
    stop_code: {
      fieldName: "stop_code",
      type: gdal.OFTString,
    },
    stop_name: {
      fieldName: "stop_name",
      type: gdal.OFTString,
    },
    stop_desc: {
      fieldName: "stop_desc",
      type: gdal.OFTString,
    },
    stop_lat: {
      fieldName: "stop_lat",
      type: gdal.OFTReal,
    },
    stop_lon: {
      fieldName: "stop_lon",
      type: gdal.OFTReal,
    },
    zone_id: {
      fieldName: "zone_id",
      type: gdal.OFTString,
    },
    stop_url: {
      fieldName: "stop_url",
      type: gdal.OFTString,
    },
    location_type: {
      fieldName: "loc_type",
      type: gdal.OFTString,
    },
    stop_timezone: {
      fieldName: "stop_tmzn",
      type: gdal.OFTString,
    },
    wheelchair_boarding: {
      fieldName: "wchair_bdn",
      type: gdal.OFTReal,
    },
  };

  _.forEach(propDefs, ({ type, fieldName }) =>
    addFieldToLayer(layer, fieldName, type)
  );

  const fieldDefinitionPairs = [];

  for (const [name, type] of fieldDefinitionPairs) {
    addFieldToLayer(layer, name, type);
  }

  const iter = GeoJsonGtfsDAO.makeStopsIterator();

  for (const geojsonPoint of iter) {
    const gdalFeature = new gdal.Feature(layer);

    Object.keys(geojsonPoint.properties).forEach((prop) => {
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

const addGeoJsonShapesLayer = (dataset) => {
  const layer = dataset.layers.create(
    `${GEOJSON_GTFS}_shapes`,
    wgs84,
    gdal.LineString
  );

  addFieldToLayer(layer, "shape_id", gdal.OFTString);

  const iter = GeoJsonGtfsDAO.makeShapesIterator();

  for (const geojsonLineString of iter) {
    const gdalFeature = new gdal.Feature(layer);

    gdalFeature.fields.set("shape_id", geojsonLineString.id);

    const lineString = new gdal.LineString();

    turf
      .getCoords(geojsonLineString)
      .forEach(([lon, lat]) => lineString.points.add(new gdal.Point(lon, lat)));

    gdalFeature.setGeometry(lineString);

    layer.features.add(gdalFeature);
  }
};

const addGtfsNetworkLayer = (dataset) => {
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
    ["stop_dist", gdal.OFTReal],
  ];

  const definedFields = fieldDefinitionPairs.map(([field]) => field);

  for (const [name, type] of fieldDefinitionPairs) {
    addFieldToLayer(layer, name, type);
  }

  const iter = GtfsNetworkDAO.makeShapeSegmentsIterator();

  for (const geojsonLineString of iter) {
    const gdalFeature = new gdal.Feature(layer);

    Object.keys(geojsonLineString.properties).forEach((prop) => {
      const fieldName = prop
        .replace(/^shape_index$/, "shape_idx")
        .replace(/^from_stop_ids$/, "from_stops")
        .replace(/^to_stop_ids$/, "to_stops");

      if (definedFields.includes(fieldName)) {
        let v = geojsonLineString.properties[prop];

        if (_.isNil(v)) {
          v = null;
        } else if (typeof v !== "string") {
          v = JSON.stringify(v);
        }

        gdalFeature.fields.set(fieldName, v);
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

const addShstMatchesLayer = (dataset) => {
  const layer = dataset.layers.create(`shst_matches`, wgs84, gdal.LineString);

  // id              INTEGER PRIMARY KEY AUTOINCREMENT,
  // shape_id        TEXT,
  // shape_index     INTEGER,
  // shst_reference  TEXT,
  // section_start   REAL,
  // section_end     REAL,
  // osrm_dir        TEXT,
  // feature_len_km  REAL,
  // feature         TEXT,

  const fieldDefinitionPairs = [
    ["id", gdal.OFTInteger],
    ["shst_ref", gdal.OFTString],
    ["shape_id", gdal.OFTString],
    ["shape_idx", gdal.OFTInteger],
  ];

  const definedFields = fieldDefinitionPairs.map(([field]) => field);

  for (const [name, type] of fieldDefinitionPairs) {
    addFieldToLayer(layer, name, type);
  }

  const iter = GtfsOsmNetworkDAO.makeAllShstMatchesIterator();

  for (const shstMatch of iter) {
    const gdalFeature = new gdal.Feature(layer);

    Object.keys(shstMatch.properties).forEach((prop) => {
      const fieldName = prop
        .replace(/^shst_reference$/, "shst_ref")
        .replace(/^pp_shape_id$/, "shape_id")
        .replace(/^shape_index$/, "shape_idx");

      if (definedFields.includes(fieldName)) {
        let v = shstMatch.properties[prop];

        if (_.isNil(v)) {
          v = null;
        } else if (typeof v !== "string") {
          v = JSON.stringify(v);
        }

        gdalFeature.fields.set(fieldName, v);
      }
    });

    const lineString = new gdal.LineString();

    turf
      .getCoords(shstMatch)
      .forEach(([lon, lat]) => lineString.points.add(new gdal.Point(lon, lat)));

    gdalFeature.setGeometry(lineString);

    layer.features.add(gdalFeature);
  }
};

const addChosenShstMatchesLayer = (dataset) => {
  const layer = dataset.layers.create(
    `chosen_shst_matches`,
    wgs84,
    gdal.LineString
  );

  const fieldDefinitionPairs = [
    ["id", gdal.OFTInteger],
    ["shst_ref", gdal.OFTString],
    ["shape_id", gdal.OFTString],
    ["shape_idx", gdal.OFTInteger],
  ];

  const definedFields = fieldDefinitionPairs.map(([field]) => field);

  for (const [name, type] of fieldDefinitionPairs) {
    addFieldToLayer(layer, name, type);
  }

  const iter = GtfsOsmNetworkDAO.makeAllChosenShstMatchesIterator();

  for (const shstMatch of iter) {
    const gdalFeature = new gdal.Feature(layer);

    Object.keys(shstMatch.properties).forEach((prop) => {
      const fieldName = prop
        .replace(/^shstReferenceId$/, "shst_ref")
        .replace(/^pp_shape_id$/, "shape_id")
        .replace(/^pp_shape_index$/, "shape_idx");

      if (definedFields.includes(fieldName)) {
        let v = shstMatch.properties[prop];

        if (_.isNil(v)) {
          v = null;
        } else if (typeof v !== "string") {
          v = JSON.stringify(v);
        }

        gdalFeature.fields.set(fieldName, v);
      }
    });

    const lineString = new gdal.LineString();

    turf
      .getCoords(shstMatch)
      .forEach(([lon, lat]) => lineString.points.add(new gdal.Point(lon, lat)));

    gdalFeature.setGeometry(lineString);

    layer.features.add(gdalFeature);
  }
};

const addConflationJoinLayer = (dataset) => {
  const layer = dataset.layers.create(
    `gtfs_conflation_map_join`,
    wgs84,
    gdal.MultiLineString
  );

  const fieldDefinitionPairs = [
    ["id", gdal.OFTInteger],
    ["gtfsshp", gdal.OFTString],
    ["gtfsshpidx", gdal.OFTString],
  ];

  const definedFields = fieldDefinitionPairs.map(([field]) => field);

  for (const [name, type] of fieldDefinitionPairs) {
    addFieldToLayer(layer, name, type);
  }

  const iter = GtfsConflationMapJoinDAO.makeGtfsConflationMapJoinIterator();

  for (const multiLineString of iter) {
    const gdalFeature = new gdal.Feature(layer);

    Object.keys(multiLineString.properties).forEach((prop) => {
      const fieldName = prop
        .replace(/^gtfs_shape_id$/, "gtfsshp")
        .replace(/^gtfs_shape_index$/, "gtfsshpidx");

      if (definedFields.includes(fieldName)) {
        let v = multiLineString.properties[prop];

        if (_.isNil(v)) {
          v = null;
        } else if (typeof v !== "string") {
          v = JSON.stringify(v);
        }

        gdalFeature.fields.set(fieldName, v);
      }
    });

    const multiLS = new gdal.MultiLineString();

    const geoms = turf.getCoords(multiLineString);

    for (let i = 0; i < geoms.length; ++i) {
      const geom = geoms[i];

      const lineString = new gdal.LineString();

      for (let j = 0; j < geom.length; ++j) {
        const [lon, lat] = geom[j];

        lineString.points.add(new gdal.Point(lon, lat));
      }

      multiLS.children.add(lineString);
    }

    gdalFeature.setGeometry(multiLS);

    layer.features.add(gdalFeature);
  }
};

function outputShapefile(output_file) {
  if (!output_file) {
    console.error("The output_file parameter is required");
    process.exit(1);
  }

  if (existsSync(output_file)) {
    console.error(`You must first remove the output file ${output_file}.`);
    process.exit(1);
  }

  const dataset = gdal.open(output_file, "w", "ESRI Shapefile");

  addGeoJsonStopsLayer(dataset);
  addGeoJsonShapesLayer(dataset);
  addGtfsNetworkLayer(dataset);
  addShstMatchesLayer(dataset);
  addChosenShstMatchesLayer(dataset);
  addConflationJoinLayer(dataset);

  dataset.close();
}

module.exports = {
  outputShapefile,
};
