/* eslint-disable jsdoc/require-jsdoc */

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

// let counter = 0;

const removeRedundantCoords = coords =>
  coords.filter((coord, i) => !_.isEqual(coords[i - 1], coord));

const analyze = (orig, sub) => {
  // Snap each vertex of sub to the orig
  //   Record:
  //           1. Dist from orig start
  //           2. Dist from orig end
  //           3. Dist from snapped pt to next sub vertex snapped pt
  //           4. Dist from snapped pt to prev sub vertex snapped pt

  const origLen = turf.length(orig);

  const subCoords = removeRedundantCoords(turf.getCoords(sub));
  const subPoints = subCoords.map(coord => turf.point(coord));

  const overlapInfo = subPoints.reduce((acc, pt, i) => {
    const {
      properties: { location: snappedPtDistAlong }
    } = turf.nearestPointOnLine(orig, pt);
    const snappedPtDistFromEnd = origLen - snappedPtDistAlong;

    const d = {
      snappedPtDistAlong,
      snappedPtDistFromEnd,
      distFromPrevPt: null,
      distFromNextPt: null,
      snappedPtDistFromPrevSnappedPt: null,
      snappedPtDistFromNextSnappedPt: null
    };

    const prev = _.last(acc);
    if (prev) {
      d.distFromPrevPt = turf.distance(subPoints[i - 1], pt);
      prev.distFromNextPt = d.distFromPrevPt;

      d.snappedPtDistFromPrevSnappedPt =
        snappedPtDistAlong - prev.snappedPtDistAlong;

      prev.snappedPtDistFromNextSnappedPt = d.snappedPtDistFromPrevSnappedPt;
    }

    acc.push(d);

    return acc;
  }, []);

  return overlapInfo;
};

const getSubGeometryOffsets = (
  { sIntxnAnalysis, sDiffAnalysis, tIntxnAnalysis, tDiffAnalysis },
  { snapToEndPoints = true } = {}
) => {
  const bothIntxnsNull = sIntxnAnalysis === null && tIntxnAnalysis === null;

  const sIntxnPasses =
    bothIntxnsNull ||
    (Array.isArray(sIntxnAnalysis) &&
      sIntxnAnalysis.length === 1 &&
      sIntxnAnalysis
        .slice(1)
        .every(
          ({ distFromPrevPt, distFromPrevSnappedPt }) =>
            Math.abs(distFromPrevPt - distFromPrevSnappedPt) < 0.001
        ));

  const tIntxnPasses =
    bothIntxnsNull ||
    (Array.isArray(tIntxnAnalysis) &&
      tIntxnAnalysis.length === 1 &&
      tIntxnAnalysis
        .slice(1)
        .every(
          ({ distFromPrevPt, distFromPrevSnappedPt }) =>
            Math.abs(distFromPrevPt - distFromPrevSnappedPt) < 0.001
        ));

  if (!sIntxnPasses || !tIntxnPasses) {
    throw new Error(
      "Intersection invariant broken. Need to implement intxnAnalysis corrections."
    );
  }

  // TODO TODO TODO TODO TODO TODO TODO
  //   Make sure Intersections and Differences offsets do NOT overlap.
  //   Use the Differences to improve Intersections accuracy.

  const [sIntxnOffsets, tIntxnOffsets, sDiffOffsets, tDiffOffsets] = [
    sIntxnAnalysis,
    tIntxnAnalysis,
    sDiffAnalysis,
    tDiffAnalysis
  ].map(subAnalysis => {
    if (subAnalysis === null) {
      return null;
    }

    return subAnalysis.map(subElemAnalysis => {
      let startAlong = _.first(subElemAnalysis).snappedPtDistAlong;
      let startFromEnd = _.first(subElemAnalysis).snappedPtDistFromEnd;

      let endAlong = _.last(subElemAnalysis).snappedPtDistAlong;
      let endFromEnd = _.last(subElemAnalysis).snappedPtDistFromEnd;

      if (snapToEndPoints) {
        if (startAlong < BUFFER_DIST) {
          startFromEnd += startAlong;
          startAlong = 0;
        }
        if (endFromEnd < BUFFER_DIST) {
          endAlong += endFromEnd;
          endFromEnd = 0;
        }
      }
      return {
        startAlong,
        startFromEnd,
        endAlong,
        endFromEnd
      };
    });
  });

  // NOTE: Above we ASSERT that the sIntxnAnalysis and tIntxnAnalysis arrays are length 1.
  return {
    sIntxnOffsets: sIntxnOffsets[0],
    sDiffOffsets,
    tIntxnOffsets: tIntxnOffsets[0],
    tDiffOffsets
  };
};

// https://postgis.net/docs/ST_LineMerge.html
const lineMerge = (feature, { radius = 0 } = {}) => {
  const type = turf.getType(feature);

  if (type === "LineString") {
    return [feature];
  }

  if (type !== "MultiLineString") {
    throw new Error("Input must be LineStrings or MultiLineStrings.");
  }

  const multiCoords = turf
    .getCoords(feature)
    .filter(c => Array.isArray(c) && c.length > 1)
    .map(removeRedundantCoords);

  if (multiCoords.length === 0) {
    return [];
  }

  const mergedCoords = _.tail(multiCoords).reduce(
    (acc, curCoords) => {
      if (!curCoords.length) {
        return acc;
      }

      const curStartCoord = _.first(curCoords);
      const curEndCoord = _.last(curCoords);

      const curStartPt = turf.point(curStartCoord);
      const curEndPt = turf.point(curEndCoord);

      for (let i = 0; i < acc.length; ++i) {
        const other = acc[i];

        const otherStartCoord = _.first(other);
        const otherEndCoord = _.last(other);

        // Simple equality of the coordinates.
        //   NOTE: Not resiliant to slightest geospatial errors.
        if (_.isEqual(curStartCoord, otherEndCoord)) {
          other.push(...curCoords.slice(1));
          return acc;
        }
        if (_.isEqual(curEndCoord, otherStartCoord)) {
          other.unshift(...curCoords.slice(0, -1));
          return acc;
        }

        const otherStartPt = turf.point(curStartCoord);
        const otherEndPt = turf.point(curEndCoord);

        // Using geospatial tolerances to handle geospatial errors
        if (radius) {
          if (turf.distance(curStartPt, otherEndPt) <= radius) {
            other.push(...curCoords.slice(1));
            return acc;
          }

          if (turf.distance(curEndPt, otherStartPt) <= radius) {
            other.unshift(...curCoords.slice(0, -1));
            return acc;
          }
        }
      }

      acc.push(curCoords);
      return acc;
    },
    [_.head(multiCoords)]
  );

  return mergedCoords.map(coords => turf.lineString(coords));
};

const geometryToGeoJson = (geometry, removeShortSegments) => {
  const feature = JSON.parse(geometry.toJSON());

  if (turf.getType(feature) === "LineString") {
    try {
      const coords = turf.getCoords(feature);
      if (!_.flatMapDeep(coords).length) {
        return null;
      }
    } catch (err) {
      // console.debug('invalid feature')
      return null;
    }
    return removeShortSegments && turf.length(feature) < SHORT_SEG_LENGTH_THOLD
      ? null
      : feature;
  }

  if (turf.getType(feature) === "MultiLineString") {
    try {
      const coords = turf.getCoords(feature);
      if (!_.flatMapDeep(coords).length) {
        return null;
      }
    } catch (err) {
      // console.debug('invalid feature')
      return null;
    }
    // handle linestring[] instead of bare coords
    let lineStrings = lineMerge(feature);

    if (removeShortSegments) {
      lineStrings = lineStrings.filter(f => {
        // console.log(JSON.stringify(f, null, 4));
        const len = turf.length(f);
        return len > SHORT_SEG_LENGTH_THOLD;
      });
    }

    if (lineStrings.length === 0) {
      return null;
    }

    return lineStrings.length === 1
      ? lineStrings[0]
      : turf.multiLineString(lineStrings.map(f => turf.getCoords(f)));
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

    const sLen = turf.length(S);
    const tLen = turf.length(T);

    if (
      // _.uniqWith(turf.getCoords(S), _.isEqual).length < 2 ||
      // _.uniqWith(turf.getCoords(T), _.isEqual).length < 2
      sLen < SHORT_SEG_LENGTH_THOLD ||
      tLen < SHORT_SEG_LENGTH_THOLD
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

    const sDiff = s.difference(sIntxn2.buffer(BUFFER_DIST / 2));
    const tDiff = t.difference(tIntxn2.buffer(BUFFER_DIST / 2));

    const [sIntersection, tIntersection] = [sIntxn2, tIntxn2].map(
      geometryToGeoJson
    );

    const [sDifference, tDifference] = [sDiff, tDiff].map(geometryToGeoJson);

    const expected =
      _.isNil(sIntersection) === _.isNil(tIntersection) &&
      (_.isNil(sIntersection) ||
        turf.getType(sIntersection) === "LineString") &&
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
      console.warn(
        JSON.stringify({
          message: "WARNING: Unexpected cospatiality result",
          payload: {
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

    // if (++counter % 1000 === 0) {
    // console.debug(counter);
    // }

    // if (counter === 100) {
    // process.exit();
    // }

    const [sIntxnAnalysis, tIntxnAnalysis, sDiffAnalysis, tDiffAnalysis] = [
      [S, sIntersection],
      [T, tIntersection],
      [S, sDifference],
      [T, tDifference]
    ].map(([orig, sub]) => {
      if (sub === null) {
        return null;
      }

      try {
        return turf.getType(sub) === "LineString"
          ? [analyze(orig, sub)]
          : turf
              .getCoords(sub)
              .map(coords => analyze(orig, turf.lineString(coords)));
      } catch (err) {
        console.error("@".repeat(15));
        console.error(turf.getType(sub));
        console.error(JSON.stringify({ sub }, null, 4));
        console.error(JSON.stringify(turf.getCoords(sub), null, 4));
        console.error(err);
        return null;
      }
    });

    // console.log(
    // JSON.stringify(
    // {
    // // sIntersection,
    // sLen: turf.length(S),
    // sIntxnAnalysis,
    // // tIntxnAnalysis,
    // sDiffAnalysis
    // // tDiffAnalysis
    // // sCoords: turf.getCoords(S),
    // // sDifference,
    // // tIntersection,
    // // tCoords: turf.getCoords(T),
    // // tDifference,
    // // S,
    // // T: { ...T, properties: {} }
    // },
    // null,
    // 4
    // )
    // );

    const { sIntxnOffsets, tIntxnOffsets } = getSubGeometryOffsets({
      sIntxnAnalysis,
      sDiffAnalysis,
      tIntxnAnalysis,
      tDiffAnalysis
    });

    return { sLen, sIntxnOffsets, tLen, tIntxnOffsets };
  } catch (err) {
    console.error(err);
    process.exit();
    // return null;
  }

  return null;
}

module.exports = getCospatialityOfLinestrings;
