const turf = require("@turf/turf");
const _ = require("lodash");

const removeRedundantMatches = (matches) => {
  // Group the shst matches by GTFS network segment
  const matchesByTargetMapId = matches.reduce((acc, matchFeature) => {
    const {
      properties: { pp_id },
    } = matchFeature;

    try {
      const coords = turf.getCoords(matchFeature);
      if (coords.length > 1) {
        acc[pp_id] = acc[pp_id] || [];
        acc[pp_id].push(matchFeature);
      }
    } catch (err) {
      //
    }
    return acc;
  }, {});

  const targetMapIds = Object.keys(matchesByTargetMapId);
  const keepers = [];

  for (let i = 0; i < targetMapIds.length; ++i) {
    const tmId = targetMapIds[i];

    // sort the match features array in descending order by coord arr len
    matchesByTargetMapId[tmId].sort(
      (a, b) =>
        // length of the geometry coordinates array descending
        turf.getCoords(b).length - turf.getCoords(a).length ||
        // prefer matches that are not pp_osrm_assisted
        //   (if not assisted, pp_osrm_assisted = 0, otherwise 1)
        a.properties.pp_osrm_assisted - b.properties.pp_osrm_assisted
    );

    // for this target map segment
    const matchesByShstRef = matchesByTargetMapId[tmId].reduce(
      (acc, matchFeature) => {
        const {
          properties: { shstReferenceId },
        } = matchFeature;

        // If there are otherFeature matches for this shstReferenceId,
        //   we keep only those with unique coordinates.
        if (acc[shstReferenceId]) {
          const coords = turf.getCoords(matchFeature);

          // Are the coordinates of this matchFeature a subset of the
          //   coordinates of some otherFeature matchFeature with the same shstReferenceId?
          const featureIsOverlappedByOther = acc[shstReferenceId].some(
            (otherFeature) => {
              const numCoordsNotInOther = _.differenceWith(
                coords,
                turf.getCoords(otherFeature),
                _.isEqual
              ).length;

              const matchCompletelyOverlapped = numCoordsNotInOther === 0;

              return matchCompletelyOverlapped;
            }
          );

          // If there are unique coords in this match, add it to the
          //   list of matches for this shstReferenceId.
          if (!featureIsOverlappedByOther) {
            acc[shstReferenceId].push(matchFeature);
          }
        } else {
          // First instance for this shstReferenceId
          acc[shstReferenceId] = [matchFeature];
        }
        return acc;
      },
      {}
    );

    keepers.push(..._.flattenDeep(_.values(matchesByShstRef)));
  }

  return keepers;
};

module.exports = removeRedundantMatches;
