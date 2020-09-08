/* eslint-disable no-continue, no-cond-assign, jsdoc/require-jsdoc, no-param-reassign, no-constant-condition */

// MODULE PURPOSE: Cherry-pick the best shstMatches across the GTFS Shape.
//
// GTFS Shape Segments ShstMatches Selection Algorithm
//
//   Here, we use the GTFS Shape level properties decide the chosenPaths.
//
//   The candidatePaths for each Shape Segment have already been merged.
//
//   The decision making logic leverages GTFS Shape Segs with
//     a single ShstMatches Path that spans most of the Shape Seg
//     as the Ground Truths for further deductions.

const assert = require("assert");

const turf = require("@turf/turf");
const _ = require("lodash");

const findAxiomaticPaths = require("./findAxiomaticPaths");
const findNonAxiomaticPaths = require("./findNonAxiomaticPaths");

const {
  minPathLengthThld,
  maxSegPathLengthDiffRatioThld,
  maxGapDistThld,
} = require("./constants");

const computeShapeLevelPathCombinationProperties = ({
  gtfsNetEdgesShstMatches,
  subGraphComponentsTraversals,
}) => {
  if (
    !(
      Array.isArray(subGraphComponentsTraversals) &&
      subGraphComponentsTraversals.length
    )
  ) {
    return null;
  }

  assert(
    gtfsNetEdgesShstMatches.length === subGraphComponentsTraversals.length
  );

  const {
    gtfsNetworkEdge: {
      properties: { shape_id: shapeId },
    },
  } = _.first(gtfsNetEdgesShstMatches);

  const aggregatedSummary = [];

  for (
    let shapeSegIdx = 0;
    shapeSegIdx < gtfsNetEdgesShstMatches.length;
    ++shapeSegIdx
  ) {
    const { gtfsNetworkEdge, shstMatches } = gtfsNetEdgesShstMatches[
      shapeSegIdx
    ];

    const {
      properties: { shape_id, shape_index },
    } = gtfsNetworkEdge;

    assert(shapeId === shape_id);
    assert(shapeSegIdx === shape_index);

    const gtfsNetworkEdgeLength = turf.length(gtfsNetworkEdge);

    const traversalsInfo = subGraphComponentsTraversals[shapeSegIdx];

    if (traversalsInfo === null) {
      aggregatedSummary.push(null);
      continue;
    }

    const { pathLineStrings } = traversalsInfo;

    const numPaths = Array.isArray(pathLineStrings)
      ? pathLineStrings.length
      : null;

    const pathLengths = numPaths ? [] : null;
    if (pathLengths) {
      for (let i = 0; i < numPaths; ++i) {
        const path = pathLineStrings[i];
        const pathLength = turf.length(path);
        pathLengths.push(pathLength);
      }
    }

    const segPathLengthRatios =
      pathLengths &&
      pathLengths.map(
        (pathLength) =>
          Math.abs(gtfsNetworkEdgeLength - pathLength) / gtfsNetworkEdgeLength
      );

    aggregatedSummary.push({
      gtfsNetworkEdge,
      gtfsNetworkEdgeLength,
      shstMatches,
      pathLineStrings,
      pathLengths,
      segPathLengthRatios,
      shape_id,
      shape_index,
      numPaths,
    });
  }

  // We really want to do this in a loop, where we
  //   * first find axiomaticPaths using tight lenDiffRatio constraints.
  //   * then we try to limit adjacent segments' paths using tight sequentiality constraints.
  //   * then we repeat
  //     * When we don't make progress, we loosen the constraints.
  //     * When we reach the minimum acceptable thresholds for our constraints,
  //       we rank and choose.
  //
  // Find any cases where the Shape Seg has a single ShstMatches path
  //   and that path spans the entire Shape Seg.
  // These are the highest confidence starting points for deduction.

  // Array of arrays
  //   Each GTFS Shape Segment gets an entry
  //     The entry is the topologically ordered chosen paths of ShstMatches for that segment
  // Axiomatic paths minumum length in kilometers.
  const initialPathLengthThld = 0.1; // 100 meters
  let pathLengthThld = initialPathLengthThld;

  // Axiomatic paths must not differ in length from GTFS shape segs
  //   by greater than the following ratio.
  const initialSegPathLengthDiffRatioThld = 0.005; // 0.5%
  let segPathLengthDiffRatioThld = initialSegPathLengthDiffRatioThld;

  // Axiomatic paths must not have a gap between them and
  //   chosen adjacent GTFS shape seg paths greater than gapDistThld.
  const initialGapDistThld = 0.0005; // 0.5 meters
  let gapDistThld = initialGapDistThld;

  const thldScaler = Math.SQRT2;

  // Initialize the chosenPaths array.
  //   Length = number of GTFS Shape Segments.
  //   All values initialized to NULL, signifying no choice made.
  const chosenPaths = _.range(0, gtfsNetEdgesShstMatches.length).map(
    () => null
  );

  // TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO
  // Record which method was used to chose the paths.
  while (true) {
    // If every segment of the shape has paths chosen, we're done.
    if (chosenPaths.every((p) => p !== null)) {
      break;
    }

    const axioPaths = findAxiomaticPaths({
      chosenPaths,
      aggregatedSummary,
      pathLengthThld,
      segPathLengthDiffRatioThld,
      gapDistThld,
    });

    if (axioPaths !== null) {
      // === Update the chosen paths ===

      // Empty the array
      chosenPaths.length = 0;
      // Fill it with the new axioPaths.
      chosenPaths.push(...axioPaths);

      // While loop will continue with the same thresholds
      //   so that findAxiomaticPaths can leverage the new
      //   chosen paths to potentially choose others.
      //
    } else {
      // No axioPaths were chosen. We loosen the decision thresholds.

      // If the thresholds were already at the loosest acceptable values, we're done.
      if (
        pathLengthThld === minPathLengthThld &&
        segPathLengthDiffRatioThld === maxSegPathLengthDiffRatioThld &&
        gapDistThld === maxGapDistThld
      ) {
        // TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO
        //  FILTER Non-Axiomatic Choices
        //    For internal segments, if adjacent segments have chosenPaths
        //    For start and end segments, snapping GTFS shape start and end points.
        break;
      }

      pathLengthThld = Math.max(pathLengthThld / thldScaler, minPathLengthThld);

      segPathLengthDiffRatioThld = Math.min(
        segPathLengthDiffRatioThld * thldScaler,
        maxSegPathLengthDiffRatioThld
      );

      gapDistThld = Math.min(gapDistThld * thldScaler, maxGapDistThld);
    }
  }

  if (chosenPaths.some((p) => p === null)) {
    const nonAxioPaths = findNonAxiomaticPaths({
      chosenPaths,
      aggregatedSummary,
    });

    if (nonAxioPaths !== null) {
      // Empty the array
      chosenPaths.length = 0;
      // Fill it with the new axioPaths.
      chosenPaths.push(...nonAxioPaths);
    }
  }

  const metadata = {
    shapeLength: _.sumBy(gtfsNetEdgesShstMatches, ({ gtfsNetworkEdge }) =>
      turf.length(gtfsNetworkEdge)
    ),
    numSegments: gtfsNetEdgesShstMatches.length,
    numSegmentsWithChosenPaths: chosenPaths.reduce((sum, p) => sum + !!p, 0),
    chosenPathsTotalLength: chosenPaths.reduce(
      (acc, p) => acc + (p ? _.sumBy(p, turf.length) : 0),
      0
    ),
    segmentPathsLengthRatios: gtfsNetEdgesShstMatches.map(
      ({ gtfsNetworkEdge }, i) => {
        const gtfsLen = turf.length(gtfsNetworkEdge);
        const shstLen = chosenPaths[i]
          ? chosenPaths[i].reduce(
              (sum, path) => (path ? sum + turf.length(path) : sum),
              0
            )
          : 0;

        return shstLen / gtfsLen;
      }
    ),
  };

  // const diffRatio =
  // Math.abs(metadata.shapeLength - metadata.chosenPathsTotalLength) /
  // metadata.shapeLength;

  // if (diffRatio > 0.05) {
  // const shape = turf.featureCollection(
  // gtfsNetEdgesShstMatches.map(({ gtfsNetworkEdge }) =>
  // turf.lineString(turf.getCoords(gtfsNetworkEdge))
  // )
  // );

  // const paths = turf.featureCollection(
  // _.flattenDeep(chosenPaths)
  // .filter(p => p)
  // .map(path => turf.lineString(turf.getCoords(path)))
  // );

  // console.log("{}".repeat(20));
  // console.log(diffRatio);
  // console.log();
  // console.log(JSON.stringify(shape));
  // console.log();
  // console.log(JSON.stringify(paths));
  // console.log();
  // }

  return { chosenPaths, metadata };
};

module.exports = computeShapeLevelPathCombinationProperties;
