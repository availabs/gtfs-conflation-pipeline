/* eslint-disable no-continue, no-cond-assign, jsdoc/require-jsdoc, no-param-reassign */

// TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO
// Filter out any ShStMatches that FAIL a directionality test.

const turf = require("@turf/turf");
const _ = require("lodash");

const { Graph, alg: graphAlgs } = require("graphlib");

const getCospatialityOfLinestrings = require("../../../../utils/gis/getCospatialityOfLinestrings");

const mergePathSegmentsGeospatially = require("./mergePathSegmentsGeospatially");
const mergePathLineStringsUsingMetadata = require("./mergePathLineStringsUsingMetadata");

// // Introducing "error" with full knowledge of it's bounds.
// //   And informing dependents of internal tolerances.
// //   Encapsulation with QA quanta/qualia metadata.
// const DIST_BETWEEN_PAIRED_NODES = 0.002; // 2 meters

const removeRedundantCoords = coords =>
  coords.filter((coord, i) => !_.isEqual(coords[i - 1], coord));

const getRootMeanSquareDeviation = (gtfsNetEdgement, shstMatchVertices) =>
  Math.sqrt(
    shstMatchVertices.reduce(
      (acc, pt) =>
        acc + (turf.pointToLineDistance(pt, gtfsNetEdgement) * 1000) ** 2,
      0
    ) / shstMatchVertices.length
  );

const buildShstMatchSubGraphs = gtfsNetEdgesShstMatches => {
  if (
    !Array.isArray(gtfsNetEdgesShstMatches) ||
    gtfsNetEdgesShstMatches.length === 0
  ) {
    return null;
  }

  const nodeIds = {};
  let nodeIdSeq = 0;

  return gtfsNetEdgesShstMatches.map(({ gtfsNetworkEdge, shstMatches }) => {
    if (_.isEmpty(shstMatches)) {
      return null;
    }

    const subGraph = new Graph({
      directed: true,
      compound: false,
      multigraph: false
    });

    // For each shstMatch for this shape segment
    for (let j = 0; j < shstMatches.length; ++j) {
      const shstMatch = shstMatches[j];

      const coords = removeRedundantCoords(turf.getCoords(shstMatch));
      if (coords.length < 2) {
        continue;
      }

      const startCoordStr = JSON.stringify(_.first(coords));
      const endCoordStr = JSON.stringify(_.last(coords));

      // If an ID already exists for this coord in the coords->ID table,
      //   reuse the existing ID,
      // else add a new ID to the table.
      const startNodeId =
        nodeIds[startCoordStr] || (nodeIds[startCoordStr] = nodeIdSeq++);

      const endNodeId =
        nodeIds[endCoordStr] || (nodeIds[endCoordStr] = nodeIdSeq++);

      // Ordered list of all vertices in the shstMatch
      const shstMatchVertices = coords.map(coord => turf.point(coord));

      // Get the Root Mean Squared Deviation between the shstMatch's vertices
      //   and the original GTFS shape segment.
      const rmsd = getRootMeanSquareDeviation(
        gtfsNetworkEdge,
        shstMatchVertices
      );

      // TODO: Consider implications.
      // The edgeWeight: length * rmsd
      const edgeWeight = turf.length(shstMatch) * rmsd;

      // The ID for the edge is the index of the shstMatch in the shstMatches array.
      subGraph.setEdge(startNodeId, endNodeId, {
        id: j,
        edgeWeight,
        shstMatch
      });
    }

    return subGraph;
  });
};

const unionPathLineStrings = (pathLineStrings, shstMatchesById) => {
  let doMerge = true;
  while (doMerge) {
    doMerge = false;

    const mergedPaths = [];
    const mergeAlgos = [
      // If the endPt->startPt distance of two paths is less than TOLERANCE,
      //   then merge them into a single lineString
      mergePathSegmentsGeospatially,

      // If the shstMatch IDs for the two paths overlap at the ends
      //   then merge by leveraging that overlap.
      _.partialRight(mergePathLineStringsUsingMetadata, shstMatchesById)
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
              mergedPath
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

      const noGapFill = ({ id }) => id !== null;

      newPaths.sort(
        (a, b) =>
          a.properties.pathDecompositionInfo.filter(noGapFill).length -
          b.properties.pathDecompositionInfo.filter(noGapFill).length
      );

      // === Remove paths overlapped by another path ===

      // Get the shstMatch IDs for each path
      const newPathShstMatchIds = newPaths.map(path =>
        path.properties.pathDecompositionInfo
          .filter(noGapFill)
          .map(({ id }) => id)
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

      // Reset mergedPaths array
      mergedPaths.length = 0;

      // Reset mergedPaths array
      pathLineStrings.length = 0;

      // fill the pathLineStrings array with the results of merging and filtering
      pathLineStrings.push(...filteredPaths);
    }
  }
};

const createPathLineStrings = (gtfsNetworkEdge, subGraph, shstMatchesById) => {
  const sources = subGraph.sources();
  const sinks = subGraph.sinks();

  // Note: These could be empty it the subGraph is cyclic
  const subGraphSources = subGraph.sources();
  const subGraphSinks = subGraph.sinks();

  // [subGraph component][nodes in subGraph component]
  const subGraphComponents = graphAlgs.components(subGraph);

  // The sources and sinks for each segment's subGraph's components
  const subGraphComponentsSourcesAndSinks = subGraphComponents.map(
    component => {
      const subSources = _.intersection(component, sources);
      const subSinks = _.intersection(component, sinks);

      const isSourceComponent = subSources.length > 0;

      const isSinkComponent = subSinks.length > 0;

      return {
        componentSources: isSourceComponent
          ? subSources
          : _.intersection(component, subGraphSources),
        componentSinks: isSinkComponent
          ? subSinks
          : _.intersection(component, subGraphSinks)
      };
    }
  );

  // Toposorted ShstMatches for each GTFS shape segment
  // [components][sources in that component][sinks in that component]
  //   In each component, every possible path source to sink path
  const source2SinkPaths = subGraphComponentsSourcesAndSinks.map(
    ({ componentSources, componentSinks }) =>
      componentSources.map(src => {
        const paths = graphAlgs.dijkstra(subGraph, src, e => {
          const { edgeWeight } = subGraph.edge(e);

          return edgeWeight;
        });
        // subGraphPaths.push(paths);

        return componentSinks
          .map(sink => {
            if (!Number.isFinite(paths[sink].distance)) {
              return null;
            }

            let s = sink;
            let { predecessor } = paths[sink];
            const path = [sink];
            while (({ predecessor } = paths[s])) {
              if (!predecessor) {
                break;
              }
              path.push(predecessor);
              s = predecessor;
            }

            const p = path.filter(e => e).reverse();
            return p.length ? p : null;
          })
          .filter(p => p);
      })
  );

  const pathLineStrings =
    Array.isArray(source2SinkPaths) &&
    _.flattenDeep(
      source2SinkPaths.map(
        // Each element of the source2SinkPaths array is represents a component
        //   Each component has a two dimensional array
        //     componentSourcesArr
        // The componentSourcesArr for this particular shape segment
        componentSourcesArr => {
          const gtfsNetworkEdgeLength = turf.length(gtfsNetworkEdge);

          const {
            properties: { shape_id, shape_index }
          } = gtfsNetworkEdge;

          const shstMatchPaths =
            // For each component in the shape segment's shstMatches subGraph
            Array.isArray(componentSourcesArr)
              ? componentSourcesArr.map(componentSinksArr => {
                  if (
                    !(
                      Array.isArray(componentSinksArr) &&
                      componentSinksArr.length
                    )
                  ) {
                    return null;
                  }

                  const mergedLineStrings = componentSinksArr.map(path => {
                    const pathSummary = _.flatten(
                      _.tail(path).map((w, path_index) => {
                        const v = path[path_index];
                        const { shstMatch } = subGraph.edge(v, w);

                        const {
                          id,
                          properties: {
                            shstReferenceId,
                            section: shstReferenceSection
                          }
                        } = shstMatch;

                        return {
                          id,
                          shstReferenceId,
                          shstReferenceSection,
                          len: turf.length(shstMatch),
                          coords: turf.getCoords(shstMatch)
                        };
                      })
                    );

                    const pathCoords = removeRedundantCoords(
                      _.flatten(pathSummary.map(({ coords }) => coords))
                    );

                    if (pathCoords < 2) {
                      return null;
                    }

                    const pathDecompositionInfo = pathSummary.map(p =>
                      _.omit(p, "coords")
                    );

                    const pathLineString = turf.lineString(pathCoords, {
                      shape_id,
                      shape_index,
                      pathDecompositionInfo,
                      gtfsNetworkEdgeLength
                    });

                    const mergedShstMatchesLength = turf.length(pathLineString);

                    const lengthDifference =
                      gtfsNetworkEdgeLength - mergedShstMatchesLength;
                    const lengthRatio =
                      gtfsNetworkEdgeLength / mergedShstMatchesLength;

                    Object.assign(pathLineString.properties, {
                      mergedShstMatchesLength,
                      lengthDifference,
                      lengthRatio
                    });

                    return pathLineString;
                  });

                  return mergedLineStrings;
                })
              : null;

          return shstMatchPaths;
        }
      )
    ).filter(p => p);

  // MUTATES THE pathLineStrings ARRAY
  unionPathLineStrings(pathLineStrings, shstMatchesById);

  return pathLineStrings;
};

const getPathsPairwiseCospatiality = pathLineStrings =>
  pathLineStrings.reduce((acc, S, sIdx) => {
    for (let tIdx = sIdx + 1; tIdx < pathLineStrings.length; ++tIdx) {
      const T = pathLineStrings[tIdx];
      try {
        const cospatiality = getCospatialityOfLinestrings(S, T);
        acc.push({
          sIdx,
          tIdx,
          cospatiality
        });
      } catch (err) {
        console.error(JSON.stringify({ S, T }, null, 4));
        throw err;
      }
    }

    return acc;
  }, []);

const computeSubGraphComponentsTraversals = (
  gtfsNetEdgesShstMatches,
  shstMatchesById
) => {
  if (
    !(Array.isArray(gtfsNetEdgesShstMatches) && gtfsNetEdgesShstMatches.length)
  ) {
    return null;
  }

  const subGraphs = buildShstMatchSubGraphs(gtfsNetEdgesShstMatches);

  if (!(Array.isArray(subGraphs) && subGraphs.filter(g => g).length)) {
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
        : null
    };
  });
};

module.exports = computeSubGraphComponentsTraversals;
