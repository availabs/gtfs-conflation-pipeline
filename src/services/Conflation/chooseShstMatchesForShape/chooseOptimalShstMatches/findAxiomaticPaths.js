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

const _ = require("lodash");

const getSequentiality = require("../../../../utils/gis/getSequentiality");

const findAxiomaticPaths = ({
  chosenPaths,
  aggregatedSummary,
  pathLengthThld,
  segPathLengthDiffRatioThld,
  gapDistThld,
}) => {
  let progress = false;

  const axioPaths = chosenPaths.reduce(
    (acc, chosenPath, i) => {
      // Path has already been chosen for this segment.
      //   We copy it into the accumulator.
      if (!_.isEmpty(chosenPath)) {
        acc[i] = chosenPath;
        return acc;
      }

      // No path has yet been chosen.
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

module.exports = findAxiomaticPaths;
