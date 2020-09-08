/* eslint-disable no-continue */

// Builds a graph with all the start_nodes and end_nodes in the shstMatches.
//   The weights of the edges is determined by the getEdgeWeight function defined above.

const turf = require("@turf/turf");
const { Graph } = require("graphlib");
const memoizeOne = require("memoize-one");
const _ = require("lodash");

const removeRedundantCoords = require("./removeRedundantCoords");

const getCleanedCoords = memoizeOne((feature) =>
  removeRedundantCoords(turf.getCoords(feature))
);

const getRootMeanSquareDeviation = (gtfsNetEdge, shstMatch) => {
  // Ordered list of all vertices in the shstMatch
  const shstMatchVertices = getCleanedCoords(shstMatch).map((coord) =>
    turf.point(coord)
  );

  return Math.sqrt(
    shstMatchVertices.reduce(
      (acc, pt) =>
        acc +
        // NOTE: Using meters since squaring.
        turf.pointToLineDistance(pt, gtfsNetEdge, { units: "meters" }) ** 2,
      0
    ) / shstMatchVertices.length
  );
};

const getEdgeWeight = (gtfsNetworkEdge, shstMatch) => {
  // Get the Root Mean Squared Deviation between
  //   the shstMatch's vertices and the original GTFS shape segment.
  const rmsd = getRootMeanSquareDeviation(gtfsNetworkEdge, shstMatch);

  // TODO: Consider implications.
  // The edgeWeight: length * rmsd
  const edgeWeight = turf.length(shstMatch) * rmsd;

  return edgeWeight;
};

const buildShstMatchSubGraphsPerGtfsShapeSegment = (
  gtfsNetEdgesShstMatches
) => {
  if (
    !Array.isArray(gtfsNetEdgesShstMatches) ||
    gtfsNetEdgesShstMatches.length === 0
  ) {
    return null;
  }

  const nodeIds = {};
  let nodeIdSeq = 0;

  const subGraphsPerGtfsShapeSegment = gtfsNetEdgesShstMatches.map(
    ({ gtfsNetworkEdge, shstMatches }) => {
      if (_.isEmpty(shstMatches)) {
        return null;
      }

      const subGraph = new Graph({
        directed: true,
        compound: false,
        multigraph: false,
      });

      // For each shstMatch for this shape segment
      for (let j = 0; j < shstMatches.length; ++j) {
        const shstMatch = shstMatches[j];

        const coords = getCleanedCoords(shstMatch);

        if (coords.length < 2) {
          continue;
        }

        // Stringified coords act as graph node IDs.
        // FIXME: This approach requires exact geospatial equality.
        //        Perhaps better to allow some error tolerance.
        const startCoordStr = JSON.stringify(_.first(coords));
        const endCoordStr = JSON.stringify(_.last(coords));

        // If an ID already exists for this coord in the coords->ID table,
        //   reuse the existing ID, else add a new ID to the table.
        const startNodeId =
          nodeIds[startCoordStr] || (nodeIds[startCoordStr] = nodeIdSeq++);

        const endNodeId =
          nodeIds[endCoordStr] || (nodeIds[endCoordStr] = nodeIdSeq++);

        const edgeWeight = getEdgeWeight(gtfsNetworkEdge, shstMatch);

        // The ID for the edge is the index of the shstMatch in the shstMatches array.
        subGraph.setEdge(startNodeId, endNodeId, {
          id: j,
          edgeWeight,
          shstMatch,
        });
      }

      return subGraph;
    }
  );

  return Array.isArray(subGraphsPerGtfsShapeSegment) &&
    subGraphsPerGtfsShapeSegment.filter((g) => g).length
    ? subGraphsPerGtfsShapeSegment
    : null;
};

module.exports = buildShstMatchSubGraphsPerGtfsShapeSegment;
