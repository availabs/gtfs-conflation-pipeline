/* eslint-disable no-cond-assign */

const turf = require("@turf/turf");
const _ = require("lodash");

const { alg: graphAlgs } = require("graphlib");

const unionPathLineStrings = require("./unionPathLineStrings");

const removeRedundantCoords = require("./removeRedundantCoords");

const createPathLineStrings = (gtfsNetworkEdge, subGraph, shstMatchesById) => {
  const sources = subGraph.sources();
  const sinks = subGraph.sinks();

  // Note: These could be empty if the subGraph is cyclic
  const subGraphSources = subGraph.sources();
  const subGraphSinks = subGraph.sinks();

  // [subGraph component][nodes in subGraph component]
  const subGraphComponents = graphAlgs.components(subGraph);

  // The sources and sinks for each segment's subGraph's components
  const subGraphComponentsSourcesAndSinks = subGraphComponents.map(
    (component) => {
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
          : _.intersection(component, subGraphSinks),
      };
    }
  );

  // Toposorted ShstMatches for each GTFS shape segment
  // [components][sources in that component][sinks in that component]
  //   In each component, every possible path source to sink path
  const source2SinkPaths = subGraphComponentsSourcesAndSinks.map(
    ({ componentSources, componentSinks }) =>
      componentSources.map((src) => {
        const paths = graphAlgs.dijkstra(subGraph, src, (e) => {
          const { edgeWeight } = subGraph.edge(e);

          return edgeWeight;
        });

        return componentSinks
          .map((sink) => {
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

            const p = path.filter((e) => e).reverse();
            return p.length ? p : null;
          })
          .filter((p) => p);
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
        (componentSourcesArr) => {
          const gtfsNetworkEdgeLength = turf.length(gtfsNetworkEdge);

          const {
            properties: { shape_id, shape_index },
          } = gtfsNetworkEdge;

          const shstMatchPaths =
            // For each component in the shape segment's shstMatches subGraph
            Array.isArray(componentSourcesArr)
              ? componentSourcesArr.map((componentSinksArr) => {
                  if (
                    !(
                      Array.isArray(componentSinksArr) &&
                      componentSinksArr.length
                    )
                  ) {
                    return null;
                  }

                  const mergedLineStrings = componentSinksArr.map((path) => {
                    const pathSummary = _.flatten(
                      _.tail(path).map((w, path_index) => {
                        const v = path[path_index];
                        const { shstMatch } = subGraph.edge(v, w);

                        const {
                          id,
                          properties: {
                            shstReferenceId,
                            section: shstReferenceSection,
                          },
                        } = shstMatch;

                        return {
                          id,
                          shstReferenceId,
                          shstReferenceSection,
                          len: turf.length(shstMatch),
                          coords: turf.getCoords(shstMatch),
                        };
                      })
                    );

                    const pathCoords = removeRedundantCoords(
                      _.flatten(pathSummary.map(({ coords }) => coords))
                    );

                    if (pathCoords < 2) {
                      return null;
                    }

                    const pathDecompositionInfo = pathSummary.map((p) =>
                      _.omit(p, "coords")
                    );

                    const pathLineString = turf.lineString(pathCoords, {
                      shape_id,
                      shape_index,
                      pathDecompositionInfo,
                      gtfsNetworkEdgeLength,
                    });

                    const mergedShstMatchesLength = turf.length(pathLineString);

                    const lengthDifference =
                      gtfsNetworkEdgeLength - mergedShstMatchesLength;
                    const lengthRatio =
                      gtfsNetworkEdgeLength / mergedShstMatchesLength;

                    Object.assign(pathLineString.properties, {
                      mergedShstMatchesLength,
                      lengthDifference,
                      lengthRatio,
                    });

                    return pathLineString;
                  });

                  return mergedLineStrings;
                })
              : null;

          return shstMatchPaths;
        }
      )
    ).filter((p) => p);

  // MUTATES THE pathLineStrings ARRAY
  unionPathLineStrings(pathLineStrings, shstMatchesById);

  return pathLineStrings;
};

module.exports = createPathLineStrings;
