/* eslint-disable no-param-reassign, jsdoc/require-jsdoc  */

const turf = require("@turf/turf");
const _ = require("lodash");

// https://lotadata.com/blog/how-precisely-accurate-is-your-geo-intelligence
const PRECISION = 6;

function roundGeometryCoordinates(feature) {
  const geoJsonType = turf.getType(feature);

  if (geoJsonType === "Point") {
    const [lon, lat] = turf.getCoord(feature);

    feature.geometry.coordinates = [
      _.round(lon, PRECISION),
      _.round(lat, PRECISION)
    ];

    return feature;
  }

  if (geoJsonType === "LineString") {
    const coords = turf.getCoords(feature);

    feature.geometry.coordinates = coords.map(([lon, lat]) => [
      _.round(lon, PRECISION),
      _.round(lat, PRECISION)
    ]);

    return feature;
  }

  throw new Error(
    "roundGeometryCoordinates supports GeoJSON Points and LineStrings"
  );
}

module.exports = roundGeometryCoordinates;
