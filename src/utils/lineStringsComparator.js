/* eslint-disable jsdoc/require-param-type, jsdoc/require-returns-type, jsdoc/require-param */

// https://en.wikipedia.org/wiki/Hausdorff_distance

const turf = require("@turf/turf");
const gdal = require("gdal");

const TRANSLATE_DIST_THRESHOLD = 50 / 1000; /* km */

/**
 * Relative spatial similarity of the two GeoJSON LineStrings
 *
 * @param f1 GTFS GeoJSON LineString
 * @param f2 OSM-Based GeoJSON LineString (From OSRM or SharedStreets)
 * @returns dissimilarity
 */
function lineStringsComparator(
  f1,
  f2,
  { translateDistThreshold = TRANSLATE_DIST_THRESHOLD } = {}
) {
  if (turf.getType(f1) !== "LineString" || turf.getType(f2) !== "LineString") {
    throw new Error("lineStringsComparator takes two GeoJSON LineStrings.");
  }

  // First we translate the 2nd line so that the lines share a start point
  const p1 = turf.point(turf.getCoords(f1)[0]);
  const p2 = turf.point(turf.getCoords(f2)[0]);

  const bearing = turf.bearing(p1, p2);
  const distance = turf.distance(p1, p2);

  // If the distance between the two start points exceeds the threshold,
  //   multiply the Hausdorff distance by the square of the ratio dist to thold.
  const distTholdMultr =
    distance <= translateDistThreshold
      ? 1
      : (distance / translateDistThreshold) ** 2;

  const tf2 = turf.transformTranslate(f2, distance, bearing);

  // Minimize the effect of resolution differences. (Assuming OSM is higher res.)
  // https://turfjs.org/docs/#simplify
  // https://en.wikipedia.org/wiki/Ramer%E2%80%93Douglas%E2%80%93Peucker_algorithm
  const s2 = turf.simplify(tf2);

  // Then we create gdal LineStrings
  const geom1 = new gdal.LineString();
  const geom2 = new gdal.LineString();

  // https://en.wikipedia.org/wiki/Ramer%E2%80%93Douglas%E2%80%93Peucker_algorithm
  turf
    .getCoords(f1)
    .forEach(coord => geom1.points.add(new gdal.Point(...coord)));
  turf
    .getCoords(s2)
    .forEach(coord => geom2.points.add(new gdal.Point(...coord)));

  // http://naturalatlas.github.io/node-gdal/classes/gdal.LineString.html#method-difference
  return geom1.difference(geom2).getLength() * distTholdMultr;
}

module.exports = lineStringsComparator;
