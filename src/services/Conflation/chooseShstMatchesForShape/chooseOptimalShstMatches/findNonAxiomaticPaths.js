/* eslint-disable no-continue, no-cond-assign, jsdoc/require-jsdoc, no-param-reassign, no-constant-condition */

const assert = require("assert");

const turf = require("@turf/turf");
const _ = require("lodash");

const getCospatialityOfLinestrings = require("../../../../utils/gis/getCospatialityOfLinestrings");

const maxOverlapThld = 0.002; // 2 meters

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
        // gtfsNetworkEdge,
        // shape_id,
        // shstMatches,
        pathLineStrings,
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
        if (cospatialities[i].every((cospat) => cospat === null)) {
          cospatialities[i] = null;
        }
      }

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

              const comboCospat = otherCospat[i] && otherCospat[i].cospat;

              if (comboCospat === null) {
                continue;
              }

              const sOverLapLen = comboCospat.reduce(
                (acc3, { sIntxnOffsets: { startAlong, endAlong } }) =>
                  acc3 + endAlong - startAlong,
                0
              );

              const tOverLapLen = comboCospat.reduce(
                (acc3, { tIntxnOffsets: { startAlong, endAlong } }) =>
                  acc3 + endAlong - startAlong,
                0
              );

              const overlapLen = Math.max(sOverLapLen, tOverLapLen);

              const overlapExceedsThld = overlapLen > maxOverlapThld;

              if (overlapExceedsThld) {
                constrainers.push(j);
              }
            }
          }

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

              const include = constrainers.every((k) => pathsCombo[k] === 0);
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

      const pathsLengths = features.map((f) => turf.length(f));

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

module.exports = findNonAxiomaticPaths;
