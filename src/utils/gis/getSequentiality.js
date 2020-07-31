/* eslint-disable jsdoc/require-jsdoc */

// Sufficient within same map.
//   Buffer is too tight for GTFS-ShSt cospatiality.

const turf = require("@turf/turf");

const _ = require("lodash");

const getRelativeBearing = (a, b) => {
  const diff = b - a;

  return diff >= -180 ? diff : diff + 360;
};

const getSequentialityOfLineStrings = (S, T) => {
  try {
    if (S !== null) {
      turf.featureOf(S, "LineString", "getSequentialityOfLineStrings");
    }

    if (T !== null) {
      turf.featureOf(T, "LineString", "getSequentialityOfLineStrings");
    }

    if (S === null || T === null) {
      return null;
    }
  } catch (err) {
    throw new Error("getSequentiality takes two GeoJSON LineStrings");
  }

  const sLen = turf.length(S);
  const tLen = turf.length(T);

  const sCoords = turf.getCoords(S);
  const tCoords = turf.getCoords(T);

  const sPenultPt = turf.point(_.nth(sCoords, -2));
  const sEndCoord = _.last(sCoords);
  const sEndPt = turf.point(sEndCoord);
  const sEndBrng = turf.bearing(sPenultPt, sEndPt);

  const [tStartCoord, t2ndCoord] = tCoords;
  const tStartPt = turf.point(tStartCoord);
  const t2ndPt = turf.point(t2ndCoord);
  const tStartBrng = turf.bearing(tStartPt, t2ndPt);

  const segsRelBrng = getRelativeBearing(sEndBrng, tStartBrng);

  const isExact = _.isEqual(sEndCoord, tStartCoord);

  const gapDist = isExact ? 0 : turf.distance(sEndPt, tStartPt);
  const gapBrng = isExact || turf.bearing(sEndPt, tStartPt);
  const gapRelBrng = isExact ? null : getRelativeBearing(sEndBrng, gapBrng);

  return {
    sLen,
    tLen,
    segsRelBrng,
    gapDist,
    gapRelBrng
  };
};

module.exports = getSequentialityOfLineStrings;
