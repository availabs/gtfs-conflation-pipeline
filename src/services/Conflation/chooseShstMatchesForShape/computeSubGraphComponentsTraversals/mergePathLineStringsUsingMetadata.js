/* eslint-disable no-constant-condition */

const turf = require("@turf/turf");
const _ = require("lodash");

const removeRedundantCoords = (coords) =>
  coords.filter((coord, i) => !_.isEqual(coords[i - 1], coord));

const mergePathLineStringsUsingMetadata = (S, T, shstMatchesById) => {
  const sShstMatchIds = S.properties.pathDecompositionInfo
    .map(({ id }) => id)
    .filter((id) => id !== null);

  const tShstMatchIds = T.properties.pathDecompositionInfo
    .map(({ id }) => id)
    .filter((id) => id !== null);

  if (
    sShstMatchIds.length !== _.uniq(sShstMatchIds).length ||
    tShstMatchIds.length !== _.uniq(tShstMatchIds).length
  ) {
    throw new Error(
      "INVARIANT BROKEN: shstMatchIds within the paths are not UNIQUE."
    );
  }

  const intxnShstMatchIds = _.intersection(sShstMatchIds, tShstMatchIds);
  const intxnShstMatchIdsLength = intxnShstMatchIds.length;

  if (intxnShstMatchIdsLength === 0) {
    return null;
  }

  if (
    sShstMatchIds.length === intxnShstMatchIdsLength ||
    tShstMatchIds.length === intxnShstMatchIdsLength
  ) {
    throw new Error(
      "INVARIANT BROKEN: One set of shstMatchIds is a subset of the other."
    );
  }

  const startIntxnId = _.first(intxnShstMatchIds);
  const endIntxnId = _.last(intxnShstMatchIds);

  let predecessor = null;

  if (
    startIntxnId === _.first(tShstMatchIds) &&
    endIntxnId === _.last(sShstMatchIds)
  ) {
    predecessor = S;
  } else if (
    startIntxnId === _.first(sShstMatchIds) &&
    endIntxnId === _.last(tShstMatchIds)
  ) {
    predecessor = T;
  }

  // TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO
  // Record potential degenerate case detection
  //   If the intxnShstMatchIds.length > 0
  //     and the order detection rules fail
  //   then one, or both, of the paths contains an error
  //     because the matches for the GTFS shape segment fork.
  //   This info will be useful later when deciding which
  //     shstMatches to assign to GTFS shape segments and
  //     conflation map segments.
  if (predecessor === null) {
    return null;
  }

  const [A, B] = predecessor === S ? [S, T] : [T, S];

  const [aShstMatchIds, bShstMatchIds] =
    predecessor === S
      ? [sShstMatchIds, tShstMatchIds]
      : [tShstMatchIds, sShstMatchIds];

  // Verify intersection
  const aShstMatchIdsLength = aShstMatchIds.length;

  for (let i = 0; i < intxnShstMatchIdsLength; ++i) {
    const iid = intxnShstMatchIds[i];
    const aid =
      aShstMatchIds[aShstMatchIdsLength - intxnShstMatchIdsLength + i];
    const bid = bShstMatchIds[i];

    // Intersection IFF the entire shstMatch IDs sequences are equal.
    if (aid !== iid || bid !== iid) {
      return null;
    }
  }

  // Intersection has been verified. Merge the LineStrings
  // Mutated below using shift()
  const intxnShstMatchIdsCopy = intxnShstMatchIds.slice();

  // Mutated below using shift()
  const bPostIntxnPathDecompositionInfo = B.properties.pathDecompositionInfo.slice();

  // Keep removing shstMatch entries from the B's pathDecompositionInfo
  //   until past the intersection with A.
  while (true) {
    const { id } = bPostIntxnPathDecompositionInfo.shift();

    if (id !== null) {
      // The intxnShstMatchIds and B's shstMatchIds MUST be in sync.
      const intxnId = intxnShstMatchIdsCopy.shift();
      if (id !== intxnId) {
        throw new Error(
          "INVARIANT BROKEN: Some invalid logic concerning the shstMatchIds intersection."
        );
      }
    }

    // If we've removed all the intersection shstMatchIds, we're done.
    if (intxnShstMatchIdsCopy.length === 0) {
      break;
    }
  }

  if (_.first(bPostIntxnPathDecompositionInfo).id !== null) {
    console.warn(
      "UNEXPECTED: the first post intersection shstMatchId from B is not NULL."
    );
  }

  const aCoords = turf.getCoords(A);

  // Get the coords from B after the intersection.
  const bPostIntxnCoords = removeRedundantCoords(
    bPostIntxnPathDecompositionInfo.reduce((acc, { id }) => {
      if (id !== null) {
        const shstMatch = shstMatchesById[id];

        const coords = turf.getCoords(shstMatch);

        acc.push(...coords);
      }
      return acc;
    }, [])
  );

  const mergedCoords = removeRedundantCoords(
    Array.prototype.concat(aCoords, bPostIntxnCoords)
  );

  const mergedProperties = _.cloneDeep(A.properties);

  mergedProperties.pathDecompositionInfo.push(
    ...bPostIntxnPathDecompositionInfo
  );

  const mergedPath = turf.lineString(mergedCoords, mergedProperties);

  const {
    properties: { gtfsNetworkEdgeLength },
  } = mergedPath;

  const {
    properties: { mergeHistory: aMergeHistory = null },
  } = A;

  const {
    properties: { mergeHistory: bMergeHistory = null },
  } = B;

  const mergeHistory =
    aMergeHistory !== null || bMergeHistory !== null
      ? [[aMergeHistory, bMergeHistory]]
      : [];

  mergeHistory.push({
    algo: "mergePathLineStringsUsingMetadata",
    shstMatchIds: [
      A.properties.pathDecompositionInfo.map(({ id }) => id),
      B.properties.pathDecompositionInfo.map(({ id }) => id),
    ],
  });

  mergedPath.properties.mergeHistory = mergeHistory;

  // We update the metadata comparing the matches path length to the GTFS Shape Seg length.
  const mergedShstMatchesLength = turf.length(mergedPath);

  const lengthDifference = gtfsNetworkEdgeLength - mergedShstMatchesLength;
  const lengthRatio = gtfsNetworkEdgeLength / mergedShstMatchesLength;

  Object.assign(mergedPath.properties, {
    mergedShstMatchesLength,
    lengthDifference,
    lengthRatio,
  });

  return mergedPath;
};

module.exports = mergePathLineStringsUsingMetadata;
