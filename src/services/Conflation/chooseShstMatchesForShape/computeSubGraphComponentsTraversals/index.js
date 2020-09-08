/* eslint-disable no-continue, no-cond-assign, jsdoc/require-jsdoc, no-param-reassign */

// TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO
// Filter out any ShStMatches that FAIL a directionality test.

const _ = require("lodash");

const getCospatialityOfLinestrings = require("../../../../utils/gis/getCospatialityOfLinestrings");

const buildShstMatchSubGraphsPerGtfsShapeSegment = require("./buildShstMatchSubGraphsPerGtfsShapeSegment");

const createPathLineStrings = require("./createPathLineStrings");

const getPathsPairwiseCospatiality = (pathLineStrings) =>
  pathLineStrings.reduce((acc, S, sIdx) => {
    for (let tIdx = sIdx + 1; tIdx < pathLineStrings.length; ++tIdx) {
      const T = pathLineStrings[tIdx];
      try {
        const cospatiality = getCospatialityOfLinestrings(S, T);
        acc.push({
          sIdx,
          tIdx,
          cospatiality,
        });
      } catch (err) {
        console.error(JSON.stringify({ S, T }, null, 4));
        throw err;
      }
    }

    return acc;
  }, []);

//  The gtfsNetEdgesShstMatches data structure:
//    [
//      {
//        gtfsNetworkEdge: <GeoJSON feature for the GTFS shape segment.>,
//        shstMatches: [...shst match GeoJSON features for the GTFS shape segment.]
//      },
//      ...
//    ]
const computeSubGraphComponentsTraversals = (
  gtfsNetEdgesShstMatches,
  shstMatchesById
) => {
  if (
    !(Array.isArray(gtfsNetEdgesShstMatches) && gtfsNetEdgesShstMatches.length)
  ) {
    return null;
  }

  const subGraphs = buildShstMatchSubGraphsPerGtfsShapeSegment(
    gtfsNetEdgesShstMatches
  );

  if (subGraphs === null) {
    return null;
  }

  return subGraphs.map((subGraph, shapeSegIdx) => {
    if (subGraph === null) {
      return null;
    }

    const { gtfsNetworkEdge } = gtfsNetEdgesShstMatches[shapeSegIdx];

    const pathLineStrings = createPathLineStrings(
      gtfsNetworkEdge,
      subGraph,
      shstMatchesById
    );

    const pathsPairwiseCospatiality = getPathsPairwiseCospatiality(
      pathLineStrings
    );

    // Use finalPaths and pathsPairwiseCospatiality to
    //   1. Remove overlaps IFF same ShSt Refs
    //   ---- Later
    //   2. Toposort the paths
    //   3. Identify matching gaps

    return {
      gtfsNetworkEdge,
      pathLineStrings,
      pathsPairwiseCospatiality: !_.isEmpty(pathsPairwiseCospatiality)
        ? pathsPairwiseCospatiality
        : null,
    };
  });
};

module.exports = computeSubGraphComponentsTraversals;
