/* eslint-disable no-continue, no-constant-condition, no-cond-assign, jsdoc/require-jsdoc */

const turf = require("@turf/turf");
const _ = require("lodash");

const TOLERANCE = 0.002; // 2m

function mergeLineStringsGeospatially(S, T, { tolerance = TOLERANCE } = {}) {
  try {
    turf.featureOf(S, "LineString", "mergeLineStringsGeospatially");
    turf.featureOf(T, "LineString", "mergeLineStringsGeospatially");
  } catch (err) {
    console.error(err);
    throw new Error("mergeLineStringsGeospatially takes two LineStrings.");
  }

  const sCoords = turf.getCoords(S);
  const tCoords = turf.getCoords(T);

  const sStartPt = turf.point(_.first(sCoords));
  const sEndPt = turf.point(_.last(sCoords));

  const tStartPt = turf.point(_.first(tCoords));
  const tEndPt = turf.point(_.last(tCoords));

  // because loops break everything
  if (
    turf.distance(sStartPt, sEndPt) === 0 ||
    turf.distance(tStartPt, tEndPt) === 0
  ) {
    console.warn(
      "WARNING: mergeLineStringsGeospatially currently does not handle LineStrings that are loops."
    );
    return null;
  }

  const s2tDist = turf.distance(sEndPt, tStartPt);
  const t2sDist = turf.distance(tEndPt, sStartPt);

  if (s2tDist > tolerance && t2sDist > tolerance) {
    return null;
  }

  const sPrecedesT = s2tDist <= t2sDist;

  const [A] = sPrecedesT ? [S, T] : [T, S];

  const [aCoords, bCoords] = sPrecedesT
    ? [sCoords, tCoords]
    : [tCoords, sCoords];

  const [aEndPt, bStartPt] = sPrecedesT
    ? [sEndPt, tStartPt]
    : [tEndPt, sStartPt];

  const aLen = turf.length(A);

  // TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO
  //   Think this through and improve it.
  //
  // Take a slice of the predecessor's end
  const aSlice = turf.lineSliceAlong(
    A,
    Math.max(aLen - 2 * tolerance, 0),
    aLen
  );
  const aSliceLen = turf.length(aSlice);

  // Snap the successor's start point to the predecessor's end slice.
  const {
    properties: { location: bSnappedDistAlongSlice }
  } = turf.nearestPointOnLine(aSlice, bStartPt);

  const bSnappedDistFromSliceEnd = aSliceLen - bSnappedDistAlongSlice;

  // TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO
  //   Handle overlaps. Currently treats everything like a gap.
  //     If the short distance between the lineString ends
  //     is actually a bit of an overlap, we'd get bit of a
  //     backtracking zag, and who wants that?
  //
  //     Gap:
  //          x---x
  //                y---y
  //
  //     Overlap:
  //          x---x
  //            y---y
  //
  // For now, we just record the result of the simple gap or overlap test.
  const isGap = bSnappedDistFromSliceEnd < tolerance / 2;

  const gapDist = turf.distance(aEndPt, bStartPt);

  const mergedCoords = Array.prototype.concat(aCoords, bCoords);

  const mergedPath = turf.lineString(mergedCoords);

  return {
    order: sPrecedesT ? [S, T] : [T, S],
    isGap,
    gapDist,
    mergedPath
  };
}

module.exports = mergeLineStringsGeospatially;
