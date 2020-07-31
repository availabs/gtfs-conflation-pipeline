/* eslint-disable jsdoc/require-jsdoc */

// Sufficient within same map.
//   Buffer is too tight for GTFS-ShSt cospatiality.

const turf = require("@turf/turf");
const _ = require("lodash");
const ss = require("simple-statistics");

const validate = (S, T) => {
  try {
    if (S !== null) {
      turf.featureOf(S, "LineString", "getSequentialityOfLineStrings");
    }

    if (T !== null) {
      turf.featureOf(T, "LineString", "getSequentialityOfLineStrings");
    }
  } catch (err) {
    throw new Error("getSequentiality takes two GeoJSON LineStrings");
  }
};

const quantiles = [0, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95, 1.0];

const getSummaryStats = arr => ({
  mean: ss.mean(arr),
  stdDev: ss.standardDeviation(arr),
  quantiles: quantiles.reduce((acc, q) => {
    acc[q] = ss.quantile(arr, q);
    return acc;
  }, {})
});

const getSnappingStats = (pts, line) => {
  // Snap each vertex of sub to the orig
  //   Record:
  //           1. Dist from orig start
  //           2. Dist from orig end
  //           3. Dist from snapped pt to next sub vertex snapped pt
  //           4. Dist from snapped pt to prev sub vertex snapped pt

  const lineLen = turf.length(line);

  const snapStats = pts.reduce((acc, pt, i) => {
    const {
      properties: {
        index: snapLineSegIdx,
        dist: snapDist,
        location: snappedPtDistAlong
      }
    } = turf.nearestPointOnLine(line, pt);

    const snappedPtDistFromEnd = lineLen - snappedPtDistAlong;

    const d = {
      snapLineSegIdx,
      snapDist,
      snappedPtDistAlong,
      snappedPtDistFromEnd,
      distFromPrevPt: null,
      distFromNextPt: null,
      snappedPtDistFromPrevSnappedPt: null,
      snappedPtDistFromNextSnappedPt: null
    };

    const prev = _.last(acc);
    if (prev) {
      d.distFromPrevPt = turf.distance(pts[i - 1], pt);
      prev.distFromNextPt = d.distFromPrevPt;

      d.snappedPtDistFromPrevSnappedPt =
        snappedPtDistAlong - prev.snappedPtDistAlong;

      prev.snappedPtDistFromNextSnappedPt = d.snappedPtDistFromPrevSnappedPt;
    }

    acc.push(d);

    return acc;
  }, []);

  const summaryStats = {
    snapDistDeviance: getSummaryStats(
      _(snapStats)
        .map("snapDist")
        .sort()
        .value()
    ),
    snapDistAlongDeviance: getSummaryStats(
      _(snapStats.slice(1))
        .map(
          ({ distFromPrevPt, snappedPtDistFromPrevSnappedPt }) =>
            distFromPrevPt - snappedPtDistFromPrevSnappedPt
        )
        .sort()
        .value()
    )
  };

  return { snapStats, summaryStats };
};

// const getSnappingStats = (pts, line) =>
// pts.map((pt, i) => {
// const {
// properties: {
// index: snapLineSegIdx,
// dist: snapDist,
// location: snapLineDistAlong
// }
// } = turf.nearestPointOnLine(line, pt);

// const predecessorDist = i === 0 ? null : turf.distance(pts[i - 1], pt);
// const successorDist =
// i === pts.length - 1 ? null : turf.distance(pt, pts[i + 1]);

// return {
// snapLineSegIdx,
// snapDist,
// snapLineDistAlong,
// predecessorDist,
// successorDist
// };
// });

const getSimilarityOfLineStrings = (S, T) => {
  validate(S, T);

  if (S === null || T === null) {
    return null;
  }

  const sCleaned = turf.cleanCoords(S);
  const tCleaned = turf.cleanCoords(T);

  const sKinks = turf.kinks(sCleaned);
  const tKinks = turf.kinks(tCleaned);

  if (
    !_.isEmpty(_.get(sKinks, "features")) ||
    !_.isEmpty(_.get(tKinks, "features"))
  ) {
    console.warn(
      "getSimilarityOfLineStrings does not currently handle self-intersecting LineStrings"
    );

    // console.error();
    // console.error(JSON.stringify(sKinks, null, 4));
    // console.error();
    // console.error(JSON.stringify(S, null, 4));
    // console.error();
    // console.error(JSON.stringify(tKinks, null, 4));
    // console.error();
    // console.error(JSON.stringify(T, null, 4));
    // console.error();

    return null;
  }

  const sLen = turf.length(sCleaned);
  const tLen = turf.length(tCleaned);

  const { features: sPts } = turf.explode(sCleaned);
  const { features: tPts } = turf.explode(tCleaned);

  const sSnapStats = getSnappingStats(sPts, tCleaned);
  const tSnapStats = getSnappingStats(tPts, sCleaned);

  // return { S, T, sLen, tLen, sSnapStats, tSnapStats };
  return { sLen, tLen, sSnapStats, tSnapStats };
};

module.exports = getSimilarityOfLineStrings;
