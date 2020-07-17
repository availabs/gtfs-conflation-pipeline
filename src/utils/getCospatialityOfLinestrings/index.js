/* eslint-disable no-restricted-syntax, jsdoc/require-jsdoc, no-param-reassign */

// const { inspect } = require("util");
// const assert = require("assert");
const turf = require("@turf/turf");
const gdal = require("gdal");

const _ = require("lodash");

const BUFFER_DIST = 5e-7;
const SEGMENTS = 100;
const SHORT_SEG_LENGTH_THOLD = 0.002; // 2 meters

const getGdalLineString = f => {
  if (f === null) {
    return null;
  }
  if (turf.getType(f) !== "LineString") {
    throw new Error("GeoJSON Feature must be a LineString");
  }

  const lineString = new gdal.LineString();

  turf
    .getCoords(f)
    .forEach(([lon, lat]) => lineString.points.add(new gdal.Point(lon, lat)));

  return lineString;
};

let counter = 0;

const removeRedundantCoords = coords =>
  coords.filter((coord, i) => !_.isEqual(coords[i - 1], coord));

const mergeMultiLineString = multiLineString => {
  const multiCoords = removeRedundantCoords(turf.getCoords(multiLineString));

  const mergedCoords = _.tail(multiCoords).reduce(
    (acc, coords) => {
      const curStartCoord = _.first(coords);
      const curEndCoord = _.last(coords);

      for (let i = 0; i < acc.length; ++i) {
        const other = acc[i];
        const otherStartCoord = _.first(other);
        const otherEndCoord = _.last(other);

        if (_.isEqual(curStartCoord, otherEndCoord)) {
          other.push(...coords.slice(1));
          return acc;
        }
        if (_.isEqual(curEndCoord, otherStartCoord)) {
          other.unshift(...coords.slice(0, -1));
          return acc;
        }
      }

      acc.push(coords);
      return acc;
    },
    [_.head(multiCoords)]
  );

  return mergedCoords;
};

const geometryToGeoJson = (geometry, removeShortSegments) => {
  const feature = JSON.parse(geometry.toJSON());

  if (turf.getType(feature) === "LineString") {
    return removeShortSegments && turf.length(feature) < SHORT_SEG_LENGTH_THOLD
      ? null
      : feature;
  }

  if (turf.getType(feature) === "MultiLineString") {
    let mergedCoords = mergeMultiLineString(feature);
    if (removeShortSegments) {
      mergedCoords = mergedCoords.filter(coords => {
        const f = turf.lineString(coords);
        const len = turf.length(f);
        return len > 0.002; // 2 meters
      });
    }
    return mergedCoords.length === 1
      ? turf.lineString(mergedCoords[0])
      : turf.multiLineString(mergedCoords);
  }

  if (
    turf.getType(feature) === "Point" ||
    turf.getType(feature) === "MultiPoint" ||
    turf.getType(feature) === "GeometryCollection"
  ) {
    return null;
  }

  console.error(turf.getType(feature));
  throw new Error("Unrecognized feature type");
};

function getCospatialityOfLinestrings(S, T) {
  try {
    if (
      !S ||
      !T ||
      turf.getType(S) !== "LineString" ||
      turf.getType(T) !== "LineString"
    ) {
      throw new Error(
        "getCospatialityOfLinestrings takes two GeoJSON LineStrings"
      );
    }

    if (
      // _.uniqWith(turf.getCoords(S), _.isEqual).length < 2 ||
      // _.uniqWith(turf.getCoords(T), _.isEqual).length < 2
      turf.length(S) < SHORT_SEG_LENGTH_THOLD ||
      turf.length(T) < SHORT_SEG_LENGTH_THOLD
    ) {
      return null;
    }

    const s = getGdalLineString(S);
    const t = getGdalLineString(T);

    const sBuff = s.buffer(BUFFER_DIST, SEGMENTS);
    const tBuff = t.buffer(BUFFER_DIST, SEGMENTS);

    const sIntxn = s.intersection(tBuff); // .intersection(s);
    const tIntxn = t.intersection(sBuff); // .intersection(t);

    // clean up the intersections by removing short segments from multiLineStrings
    //   These can happen when a segment contains a loop that crosses the other
    //     segment's buffer.
    const sIntxn2 = getGdalLineString(geometryToGeoJson(sIntxn, true));
    const tIntxn2 = getGdalLineString(geometryToGeoJson(tIntxn, true));

    if (sIntxn2 === null || tIntxn2 === null) {
      if (sIntxn2 !== null || tIntxn2 !== null) {
        console.warn(
          JSON.stringify({
            message:
              "ASSUMPTION BROKEN: one segment has no intersection, while the other does.",
            payload: {
              S,
              T,
              sIntxn2: sIntxn2 && geometryToGeoJson(sIntxn),
              tIntxn2: tIntxn2 && geometryToGeoJson(tIntxn)
            }
          })
        );
      }
      return null;
    }

    // const intxn = sIntxn2.union(tIntxn2);
    // const intxnBuff = intxn.buffer(BUFFER_DIST, SEGMENTS);

    const sDiff = s.difference(sIntxn2);
    const tDiff = t.difference(tIntxn2);

    const [intersection, sIntersection, tIntersection] = [
      // intxn,
      sIntxn2,
      tIntxn2
    ].map(geometryToGeoJson, true);

    const [sDifference, tDifference] = [sDiff, tDiff].map(
      geometryToGeoJson,
      true
    );

    const expected =
      (_.isNil(tIntersection) ||
        turf.getType(tIntersection) === "LineString") &&
      (_.isNil(sDifference) ||
        turf.getType(sDifference) === "LineString" ||
        (turf.getType(sDifference) === "MultiLineString" &&
          sDifference.geometry.coordinates.length === 2)) &&
      (_.isNil(tDifference) ||
        turf.getType(tDifference) === "LineString" ||
        (turf.getType(tDifference) === "MultiLineString" &&
          tDifference.geometry.coordinates.length === 2));

    if (!expected) {
      console.log(
        JSON.stringify({
          message: "WARNING: Unexpected cospatiality result",
          payload: {
            intersection,
            sIntersection,
            sCoords: turf.getCoords(S),
            sDifference,
            tIntersection,
            tCoords: turf.getCoords(T),
            tDifference,
            S,
            T: { ...T, properties: {} }
          }
        })
      );
    }

    if (++counter % 1000 === 0) {
      console.log(counter);
    }

    // TODO: Compute & return cospatiality info using intersections and differences.
    return null;
  } catch (err) {
    console.error(err);
    process.exit();
    // return null;
  }

  return null;
}

module.exports = getCospatialityOfLinestrings;
