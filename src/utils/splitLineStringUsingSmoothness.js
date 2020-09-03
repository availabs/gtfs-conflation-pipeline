/* eslint-disable jsdoc/require-jsdoc */

// https://en.wikipedia.org/wiki/Hausdorff_distance

const turf = require("@turf/turf");
const _ = require("lodash");

const BEARING_CHANGE_THOLD = 45 * 1.5;
// const MIN_LENGTH_THOLD_KM = 0.1; // 100m
// const MAX_LENGTH_THOLD_KM = 10; // 10km

function splitLineStringUsingSmoothness(
  feature,
  {
    bearingChangeThreshold = BEARING_CHANGE_THOLD,
    // minLengthThresholdKm = MIN_LENGTH_THOLD_KM,
    // maxLengthThresholdKm = MAX_LENGTH_THOLD_KM,
  } = {}
) {
  if (turf.getType(feature) !== "LineString") {
    throw new Error(
      "splitLineStringUsingSmoothness takes a GeoJSON LineString."
    );
  }

  // a---b---c---d--e
  const coords = turf
    .getCoords(feature)
    .filter((c, i, arr) => !_.isEqual(c, arr[i - 1]));

  if (coords.length <= 2) {
    return [_.cloneDeep(feature)];
  }

  // (a, b, c, d, e) // len = 5
  // ( (a, b), (b, c), (c, d), (d, e) ) // len = 4
  const coordPairs = _.tail(coords)
    .reduce(
      (acc, coord) => {
        const prev = _.last(acc);
        prev.push(coord);
        acc.push([coord]);
        return acc;
      },
      [[_.head(coords)]]
    )
    .slice(0, -1); // last "pair" is only the endPt

  // ( B(a,b), B(b,c), B(c,d), B(d,e) ) // len = 4
  const bearings = coordPairs.map(([startCoord, endCoord]) => {
    // bearing in decimal degrees, between -180 and 180 degrees (positive clockwise)
    const b = turf.bearing(turf.point(startCoord), turf.point(endCoord));

    // convert to 0-360 clockwise
    //   For Example -45 should equal 315 (because 360 - 45 = 315).
    //      180 + (180 - 45) = 180 + 135 = 315
    return b > 0 ? b : 180 + (180 + b);
  });

  // ( Δ(B(a,b), B(b,c)), Δ(B(b,c), B(c,d)), Δ(B(c,d), B(d,e)) ) // len = 3
  const bearingDiffs = _.tail(bearings).map((bearing, i) => {
    const maxB = Math.max(bearings[i], bearing);
    const minB = Math.min(bearings[i], bearing);

    return Math.min(maxB - minB, minB + 360 - maxB);
  });

  const splitCoords = bearingDiffs.reduce(
    (acc, bDiff, i) => {
      const coord = coords[i + 2];

      if (bDiff <= bearingChangeThreshold) {
        _.last(acc).push(coord);
      } else {
        acc.push([coords[i + 1], coord]);
      }

      return acc;
    },
    [coords.slice(0, 2)]
  );

  // console.log(
  // JSON.stringify(
  // {
  // // feature_props: feature.properties,
  // feature_geom: feature.geometry,
  // // bearings,
  // // bearingDiffs,
  // splitCoords
  // // lineStrings
  // },
  // null,
  // 4
  // )
  // );

  const lineStrings = splitCoords.map((c) => turf.lineString(c));

  return lineStrings;
}

module.exports = splitLineStringUsingSmoothness;
