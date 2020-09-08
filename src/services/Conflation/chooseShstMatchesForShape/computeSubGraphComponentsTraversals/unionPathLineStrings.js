/* eslint-disable no-continue, no-param-reassign */

const _ = require("lodash");

const mergePathSegmentsGeospatially = require("./mergePathSegmentsGeospatially");
const mergePathLineStringsUsingMetadata = require("./mergePathLineStringsUsingMetadata");

// When we fill a gap, the id is set to null.
const noGapFill = ({ id }) => id !== null;

// === Remove paths overlapped by another path ===
const filterOutOverlappedPaths = (newPaths) => {
  // Get the shstMatch IDs for each path
  const newPathShstMatchIds = newPaths.map((path) =>
    path.properties.pathDecompositionInfo.filter(noGapFill).map(({ id }) => id)
  );

  // Filter out the paths where the shstMatch IDs for the path
  //   are a subset of another path's shstMatch IDs.
  // NOTE: newPaths is in sorted order by shstMatchId arr length.
  const filteredPaths = newPaths.filter((_$, i) => {
    const pathMatchIds = newPathShstMatchIds[i];

    for (let j = i + 1; j < newPaths.length; ++j) {
      const otherMatchIds = newPathShstMatchIds[j];

      const intxnShstMatchIds = _.intersection(pathMatchIds, otherMatchIds);

      const intxnShstMatchIdsLength = intxnShstMatchIds.length;

      if (intxnShstMatchIdsLength === 0) {
        // return null; // ??? Why was I returning null? I think this was a bug. ???
        continue;
      }

      const idsSetDiff = _.difference(pathMatchIds, otherMatchIds);

      // If the difference === 0, path's matches is a subset of other's.
      const keep = idsSetDiff.length > 0;

      if (!keep) {
        // Filter path out of the array because it's shstMatches are a subset of other's.
        return false;
      }
    }

    // We never encountered a case where path's shstMatches were a subset of another paths.
    return true;
  });

  return filteredPaths;
};

const unionPathLineStrings = (pathLineStrings, shstMatchesById) => {
  let doMerge = true;
  while (doMerge) {
    doMerge = false;

    const mergedPaths = [];

    // The different merge algorithms
    const mergeAlgos = [
      // If the endPt->startPt distance of two paths is less than TOLERANCE,
      //   then merge them into a single lineString
      mergePathSegmentsGeospatially,

      // If the shstMatch IDs for the two paths overlap at the ends
      //   then merge by leveraging that overlap.
      _.partialRight(mergePathLineStringsUsingMetadata, shstMatchesById),
    ];

    for (let mAlgIdx = 0; mAlgIdx < mergeAlgos.length; ++mAlgIdx) {
      const mergeAlgo = mergeAlgos[mAlgIdx];

      for (let sIdx = 0; sIdx < pathLineStrings.length; ++sIdx) {
        const S = pathLineStrings[sIdx];

        for (let tIdx = sIdx + 1; tIdx < pathLineStrings.length; ++tIdx) {
          const T = pathLineStrings[tIdx];

          const mergedPath = mergeAlgo(S, T);

          if (mergedPath !== null) {
            // Even if merge opportunity found, we need to search now
            //   for all merge opportunities because we will later
            //   remove the lineStrings that were merged, potentially
            //   removing an opportunity for another merge.
            mergedPaths.push({
              sIdx,
              tIdx,
              mergedPath,
            });
          }
        }
      }

      if (mergedPaths.length === 0) {
        continue;
      }

      // We detected an opportunity to merge, so there may yet be another
      //   using the merged results.
      doMerge = true;

      const newPaths = Array.prototype.concat(
        // Remove any paths that were merged into larger paths.
        pathLineStrings.filter(
          (_$, pathIdx) =>
            !mergedPaths.find(
              ({ sIdx, tIdx }) => sIdx === pathIdx || tIdx === pathIdx
            )
        ),
        // Concat merged paths
        mergedPaths.map(({ mergedPath }) => mergedPath)
      );

      newPaths.sort(
        (a, b) =>
          a.properties.pathDecompositionInfo.filter(noGapFill).length -
          b.properties.pathDecompositionInfo.filter(noGapFill).length
      );

      const filteredPaths = filterOutOverlappedPaths(newPaths);

      // Reset mergedPaths array
      mergedPaths.length = 0;

      // Reset mergedPaths array
      pathLineStrings.length = 0;

      // fill the pathLineStrings array with the results of merging and filtering
      pathLineStrings.push(...filteredPaths);
    }
  }
};

module.exports = unionPathLineStrings;
