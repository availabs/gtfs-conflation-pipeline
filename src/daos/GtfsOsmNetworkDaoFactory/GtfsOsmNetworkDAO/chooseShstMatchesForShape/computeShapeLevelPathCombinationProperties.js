/* eslint-disable no-continue, no-cond-assign, jsdoc/require-jsdoc, no-param-reassign */

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

const getSequentiality = require("../../../../utils/gis/getSequentiality");
// const getSimilarity = require("../../../../utils/gis/getSimilarity");
const getCospatialityOfLinestrings = require("../../../../utils/gis/getCospatialityOfLinestrings");

const minPathLengthThld = 0.01; // 10 meters
const maxSegPathLengthDiffRatioThld = 0.05; // 5%
const maxGapDistThld = 0.002; // 2 meters
const maxOverlapThld = 0.002; // 2 meters

// The axiomaticPaths must meet high criteria standards.
//   We have high confidence in these match paths.
//   We use them as the basis of our later decisions on how to handle
//     imperfect choices.
//
// CRITERIA:
//  [ ] 0. NO LOOPS
//  [x] 1. Sufficiently large length
//  [x] 2. Sufficiently high lengthRatio
//
const findAxiomaticPaths = ({
  chosenPaths,
  aggregatedSummary,
  pathLengthThld,
  segPathLengthDiffRatioThld,
  gapDistThld
}) => {
  let progress = false;

  const axioPaths = chosenPaths.reduce(
    (acc, chosenPath, i) => {
      // Paths have already been chosen
      if (!_.isEmpty(chosenPath)) {
        acc[i] = chosenPath;
        return acc;
      }

      const summary = aggregatedSummary[i];

      if (!summary) {
        return acc;
      }

      const { pathLengths, segPathLengthRatios, pathLineStrings } = summary;

      // There are no shstMatches paths to choose from for this shape segment.
      if (_.isEmpty(pathLineStrings)) {
        return acc;
      }

      const predecessorChosenPaths = chosenPaths[i - 1];
      const successorChosenPaths = chosenPaths[i + 1];

      // Because we gradually loosen the thresholds, we make sure later
      //   decisions do NOT contradict earlier ones. In this way,
      //   the higher confidence earlier decisions act as constraints
      //   on the later decisions.
      const candidatePaths = pathLineStrings.reduce((acc2, path, j) => {
        if (pathLengths[j] < pathLengthThld) {
          return acc2;
        }

        if (segPathLengthRatios[j] > segPathLengthDiffRatioThld) {
          return acc2;
        }

        if (!_.isEmpty(predecessorChosenPaths)) {
          const other = _.last(predecessorChosenPaths);
          const { gapDist } = getSequentiality(other, path);

          if (gapDist > gapDistThld) {
            return acc2;
          }
        }

        if (!_.isEmpty(successorChosenPaths)) {
          const other = _.first(successorChosenPaths);
          const { gapDist } = getSequentiality(path, other);

          if (gapDist > gapDistThld) {
            return acc2;
          }
        }

        acc2.push(path);

        return acc2;
      }, []);

      if (candidatePaths.length === 1) {
        progress = true;
        acc[i] = candidatePaths;
      }

      return acc;
    },
    _.range(0, aggregatedSummary.length).map(() => null)
  );

  return progress ? axioPaths : null;
};

const findNonAxiomaticPaths = ({ chosenPaths, aggregatedSummary }) => {
  let progress = false;

  const filteredPaths = chosenPaths.reduce(
    (acc, chosenPath, shapeSegIdx) => {
      // Paths have already been chosen
      if (!_.isEmpty(chosenPath)) {
        acc[shapeSegIdx] = chosenPath;
        return acc;
      }

      const summary = aggregatedSummary[shapeSegIdx];

      if (!summary) {
        return acc;
      }

      const {
        gtfsNetworkEdge,
        // shape_id,
        // shstMatches,
        pathLineStrings
      } = summary;

      // const gtfsNetworkEdgeLength = turf.length(gtfsNetworkEdge);

      // const features = Array.prototype.concat(pathLineStrings, shstMatches);
      const features = pathLineStrings;

      // There are no shstMatches paths to choose from for this shape segment.
      if (_.isEmpty(features)) {
        return acc;
      }

      if (features.length === 1) {
        // TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO
        // Add some criteria
        acc[shapeSegIdx] = features;
        progress = true;
        return acc;
      }

      // TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO
      //
      //   Check for overlap with predecessor and successor chosen paths
      // const predecessorChosenPaths = chosenPaths[shapeSegIdx - 1];
      // const successorChosenPaths = chosenPaths[shapeSegIdx + 1];

      // const similarities = features.map(path =>
      // getSimilarity(path, gtfsNetworkEdge)
      // );

      const cospatialities = _.range(0, features.length).map(() =>
        _.range(0, features.length).map(() => [])
      );

      for (let i = 0; i < features.length; ++i) {
        const S = features[i];

        cospatialities[i][i] = null;

        for (let j = i + 1; j < features.length; ++j) {
          const T = features[j];

          const cospat = getCospatialityOfLinestrings(S, T);

          // TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO

          cospatialities[i][j] = cospat !== null ? { self: "S", cospat } : null;
          cospatialities[j][i] = cospat !== null ? { self: "T", cospat } : null;
        }
      }

      for (let i = 0; i < cospatialities.length; ++i) {
        if (cospatialities[i].every(cospat => cospat === null)) {
          cospatialities[i] = null;
        }
      }

      // console.log(JSON.stringify({ cospatialities }, null, 4));

      // FIXME FIXME FIXME FIXME FIXME FIXME FIXME FIXME FIXME FIXME FIXME FIXME FIXME
      // This is O(2^n). n would seem to be bound such that we don't have much concern.
      // However, we must come up with a better algo/data structure.

      const satisfactoryCombos = cospatialities.reduce(
        (acc2, cospat, i) => {
          // Does a preceeding candidate path overlap this candidate path?
          const constrainers = [];
          if (cospat !== null) {
            // Does this candidate path overlap earlier candidate paths?
            //   If so, they forked and this path's inclusion depends on
            //     their inclusion/exclusion.
            for (let j = 0; j < i; ++j) {
              const otherCospat = cospatialities[j];
              if (otherCospat === null) {
                continue;
              }

              const comboCospat = otherCospat[i];

              const overlapLen =
                comboCospat !== null &&
                Math.max(
                  _.first(comboCospat.cospat).sIntxnOffsets.endAlong -
                    _.first(comboCospat.cospat).sIntxnOffsets.startAlong,
                  _.first(comboCospat.cospat).tIntxnOffsets.endAlong -
                    _.first(comboCospat.cospat).tIntxnOffsets.startAlong
                );

              const overlapExceedsThld = overlapLen > maxOverlapThld;

              if (overlapExceedsThld) {
                constrainers.push(j);
              }
            }
          }

          // console.log(JSON.stringify({ constrainers }, null, 4));

          if (constrainers.length) {
            assert(i !== 0);
            for (let j = 0; j < acc2.length; ++j) {
              // acc2 is the combinations of paths so far.
              // acc2[j] is a path combo
              const pathsCombo = acc2[j];

              // if any of the other paths that are mutually exclusive
              //   with this current path are included in the path combo,
              //   this currentl path cannot be included.
              // otherwise, it must be included to complete the combos.

              const include = constrainers.every(k => pathsCombo[k] === 0);
              pathsCombo.push(include ? 1 : 0);
            }

            return acc2;
          }

          // This path's inclusion in any of the acc2 path combos is not
          //   constrained by any preceeding paths' inclusion/exclusion.
          // Now we must look at later paths and see if there is a potential
          //    conflict. If so, this path forks the combos and becomes a
          //    constraint on the later path(s).
          let mustFork = constrainers.length > 0 && cospat !== null;
          if (!mustFork) {
            // console.log("@".repeat(10));
            // Does this candidate path overlap later candidate paths?
            for (let j = i + 1; j < cospatialities.length; ++j) {
              const otherCospat = cospatialities[j];
              if (otherCospat === null) {
                continue;
              }

              const comboCospat = otherCospat[i];

              const overlapLen =
                comboCospat !== null &&
                Math.max(
                  _.first(comboCospat.cospat).sIntxnOffsets.endAlong -
                    _.first(comboCospat.cospat).sIntxnOffsets.startAlong,
                  _.first(comboCospat.cospat).tIntxnOffsets.endAlong -
                    _.first(comboCospat.cospat).tIntxnOffsets.startAlong
                );

              const overlapExceedsThld = overlapLen > maxOverlapThld;

              if (overlapExceedsThld) {
                // console.log("overlapExceedsThld", j);
                mustFork = true;
                break;
              }
            }
          }

          if (!mustFork) {
            for (let j = 0; j < acc2.length; ++j) {
              assert(acc2[j].length === i);
              acc2[j].push(1);
            }
            return acc2;
          }

          const forks = _.cloneDeep(acc2);

          for (let j = 0; j < acc2.length; ++j) {
            assert(acc2[j].length === i);
            acc2[j].push(1);
          }

          for (let j = 0; j < forks.length; ++j) {
            assert(forks[j].length === i);
            forks[j].push(0);
          }

          acc2.push(...forks);

          return acc2;
        },
        [[]]
      );

      if (acc.length > 2 ** 10) {
        console.warn(
          "The O(n^2) algo in computeShapeLevelPathCombinationProperties needs improvement."
        );
      }

      const pathsLengths = features.map(f => turf.length(f));

      let maxValueCombo = null;
      let maxValue = -Infinity;

      for (let i = 0; i < satisfactoryCombos.length; ++i) {
        const satCombo = satisfactoryCombos[i];
        const v = satCombo.reduce(
          (totalLen, include, j) => totalLen + (include && pathsLengths[j]),
          0
        );

        // Since strictly greater, should prefer the pathsLengths
        //   over the shstMatches if the totalLens are the same.
        if (v > maxValue) {
          maxValue = v;
          maxValueCombo = satCombo;
        }
      }

      // We found a path that connects to an adjacent segment's chosen paths.
      if (!_.isEmpty(maxValueCombo)) {
        // console.log(shapeSegIdx, "maxValueCombo:", maxValueCombo);
        // console.log("maxValueCombo len:", maxValue);
        // console.log("gtfsNetworkEdgeLength:", turf.length(gtfsNetworkEdge));
        progress = true;

        // TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO
        const optimalPaths = maxValueCombo.reduce((acc2, include, i) => {
          if (include) {
            const feature = features[i];

            // const pathDecompositionInfo = _.get(
            // feature,
            // ["properties", "pathDecompositionInfo"],
            // null
            // );

            // NOTE: This code never was used. May be buggy.
            // Used a raw ShstMatch, not a merged pathLineString.
            // Need to create a synthetic pathLineString.
            // if (pathDecompositionInfo === null) {
            // const {
            // id,
            // properties: { shstReferenceId, section: shstReferenceSection },
            // geometry: { coordinates }
            // } = feature;

            // const syntheticPathDecomInfo = {
            // id,
            // shstReferenceId,
            // shstReferenceSection,
            // len: turf.length(feature)
            // };

            // const mergedShstMatchesLength = turf.length(feature);

            // const lengthDifference =
            // gtfsNetworkEdgeLength - mergedShstMatchesLength;

            // const lengthRatio =
            // gtfsNetworkEdgeLength / mergedShstMatchesLength;

            // const properties = {
            // shape_id,
            // shape_index: shapeSegIdx,
            // pathDecompositionInfo: syntheticPathDecomInfo,
            // gtfsNetworkEdgeLength,
            // mergedShstMatchesLength,
            // lengthDifference,
            // lengthRatio
            // };

            // feature = turf.lineString(coordinates, properties);
            // }

            acc2.push(feature);
          }

          return acc2;
        }, []);

        // console.log();
        // console.log(JSON.stringify(gtfsNetworkEdge));
        // console.log();
        // console.log(JSON.stringify(turf.featureCollection(optimalPaths)));

        acc[shapeSegIdx] = optimalPaths;
      }

      return acc;
    },
    _.range(0, aggregatedSummary.length).map(() => null)
  );

  return progress ? filteredPaths : null;
};

const computeShapeLevelPathCombinationProperties = params => {
  const {
    gtfsNetEdgesShstMatches,
    // shstMatchesById,
    subGraphComponentsTraversals
  } = params;

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
      properties: { shape_id: shapeId }
    }
  } = _.first(gtfsNetEdgesShstMatches);

  // if (shapeId !== "110133") {
  // return null;
  // }

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
      properties: { shape_id, shape_index }
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
        pathLength =>
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
      numPaths
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
    if (chosenPaths.every(p => p !== null)) {
      break;
    }

    const axioPaths = findAxiomaticPaths({
      chosenPaths,
      aggregatedSummary,
      pathLengthThld,
      segPathLengthDiffRatioThld,
      gapDistThld
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

  if (chosenPaths.some(p => p === null)) {
    const nonAxioPaths = findNonAxiomaticPaths({
      chosenPaths,
      aggregatedSummary
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
    )
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
