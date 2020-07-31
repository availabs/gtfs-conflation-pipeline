/* eslint-disable no-continue, no-constant-condition, no-cond-assign, jsdoc/require-jsdoc */

// Short ShSt Matches are a problem.
//   Haven't decided whether or how best to filter them out.
//   They may contain enough good information that accommodating
//     them (when joining matches to create paths) is worth while.

// [x] PLAN
//   Skip cospatiality between GTFS shape segs and ShSt Matches
//     The Geospatial is far too complicated because of large error bounds
//   We want access to as much higher-order information as possible.
//
//   Instead, use ConflationMap for Shst Ref gap filling and false match correction.
//     Then, once we have complete chains, use that more complete information
//     to do the cospatiality between GTFS and ShSt.
//
//   DO NOT drop any ShSt matches or paths.
//     ONLY report on deviance and constraint satisfaction.

// const { inspect } = require("util");

const turf = require("@turf/turf");
const _ = require("lodash");

const computeSubGraphComponentsTraversals = require("./computeSubGraphComponentsTraversals");
const computeShapeLevelPathCombinationProperties = require("./computeShapeLevelPathCombinationProperties");

// // Introducing "error" with full knowledge of it's bounds.
// //   And informing dependents of internal tolerances.
// //   Encapsulation with QA quanta/qualia metadata.
// const DIST_BETWEEN_PAIRED_NODES = 0.002; // 2 meters

const getShstMatchesById = gtfsNetEdgesShstMatches =>
  gtfsNetEdgesShstMatches.reduce((acc, { shstMatches }) => {
    if (shstMatches !== null) {
      for (let i = 0; i < shstMatches.length; ++i) {
        const shstMatch = shstMatches[i];

        acc[shstMatch.id] = shstMatch;
      }
    }

    return acc;
  }, {});

class ShstMatchesSubGraphBuilder {
  constructor(gtfsNetEdgesShstMatches) {
    this.gtfsNetEdgesShstMatches = gtfsNetEdgesShstMatches;

    this.shstMatchesById = getShstMatchesById(this.gtfsNetEdgesShstMatches);

    this.subGraphComponentsTraversals = computeSubGraphComponentsTraversals(
      this.gtfsNetEdgesShstMatches,
      this.shstMatchesById
    );

    const shapeFeatureCollection = turf.featureCollection(
      gtfsNetEdgesShstMatches.map(({ gtfsNetworkEdge }) => {
        const f = {
          ...gtfsNetworkEdge,
          properties: _.pick(gtfsNetworkEdge.properties, [
            "shape_id",
            "shape_index"
          ])
        };

        return f;
      })
    );

    const { chosenPaths } =
      computeShapeLevelPathCombinationProperties(this) || {};

    this.chosenPaths = chosenPaths;
  }

  // Shape-Level properties of segment-level match paths combinations
  //   for downstream decision making criteria.
  //
  // ??? Consider ???
  //
  //   Where there is overlap between two shape seg's matches
  //     use the original GTFS Stop Coord to determine where
  //     to split the Shst Matches where they overlap.
  //   The drawback is that this is overriding a decision
  //     made with earlier with more GTFS domain info
  //     based on the output of a potentially flawed match.
  //   However, if we have two Shst refs overlapping at a
  //     shape seg2seg junction, that is because at that junction
  //     occurs within a street and not at an intersection.
  //     The street was split because of a GTFS stop.
  //   Probably best just to snap the GTFS shape seg point at
  //     the junction to the shst refs to determine where to split
  //     the overlap.

  // TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO
  // Record which paths connect to adjacent GTFS Shape Seg paths
  //   Want to know which segment paths together allow complete
  //   traversal of the entire shape.
  // computeShapeLevelPathCombinationProperties() {
  // return 1;
  // }
}

// eslint-disable-next-line
// let counter = 0;

const toposortShstMatchesForGtfsShape = gtfsNetEdgesShstMatches => {
  if (this.counter++ === 10) {
    process.exit();
  }

  const shstMatchesSubGraphBuilder = new ShstMatchesSubGraphBuilder(
    gtfsNetEdgesShstMatches
  );

  // For each GTFS shape segment, build a subGraph using all the shstMatch's for that segment.
  // toposort each subGraph's components
  const { chosenPaths } = shstMatchesSubGraphBuilder;

  return chosenPaths;
};

module.exports = toposortShstMatchesForGtfsShape;
