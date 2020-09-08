/* eslint-disable no-restricted-syntax, no-await-in-loop, jsdoc/require-jsdoc */

const turf = require("@turf/turf");
const _ = require("lodash");

const BATCH_SIZE = 25;

const shstMatchFeatures = require("./shstMatchFeatures");

const initializeUnmatchedFeaturesArray = (features) => {
  const seenIds = new Set();

  return Array.isArray(features) && features.length
    ? features.reduce((acc, feature) => {
        const {
          id,
          properties,
          geometry: { coordinates },
        } = feature;

        const { id: propId } = properties;

        if (id && propId && id !== propId) {
          throw new Error("INVARIANT BROKEN: Feature id !== properties.id");
        }

        const featureId = id || propId;

        if (featureId === undefined) {
          throw new Error(
            "An id must be defined on the feature or in its properties."
          );
        }

        if (seenIds.has(featureId)) {
          throw new Error("INVARIANT BROKEN: Feature IDs are not UNIQUE");
        }

        seenIds.add(featureId);

        // If there are no coordinates, can't match it to OSM.
        if (!(Array.isArray(coordinates) && coordinates.length)) {
          return acc;
        }

        // SharedStreets does not preserve the feature id.
        // It does perserve the input feature properties.
        // Therefore, we need to ensure that there is an "id"
        //   in the feature properties.
        acc.push({ ...feature, properties: { ...properties, id: featureId } });

        return acc;
      }, [])
    : null;
};

async function match(features) {
  const unmatchedFeatures = initializeUnmatchedFeaturesArray(features);

  return _.isEmpty(unmatchedFeatures)
    ? null
    : shstMatchFeatures(unmatchedFeatures);
}

const removeOverlaps = (matches) => {
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

        // If there are other matches for this shstReferenceId,
        //   we keep only those with unique coordinates.
        if (acc[shstReferenceId]) {
          const coords = turf.getCoords(matchFeature);

          // Are the coordinates of this matchFeature a subset of the
          //   coordinates of some other matchFeature with the same shstReferenceId?
          const featureIsOverlappedByOther = acc[shstReferenceId].some(
            (other) => {
              const numCoordsNotInOther = _.differenceWith(
                coords,
                turf.getCoords(other),
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

async function* matchSegmentedShapeFeatures(featuresIterator) {
  const batch = [];
  // let bboxPoly = null;

  for (const feature of featuresIterator) {
    batch.push(feature);

    if (batch.length === BATCH_SIZE) {
      // const batchFeatureCollection = turf.featureCollection(batch);
      // const bbox = turf.bbox(batchFeatureCollection);
      // bbox[0] -= 0.0001;
      // bbox[1] -= 0.0001;
      // bbox[2] += 0.0001;
      // bbox[3] += 0.0001;

      // bboxPoly = turf.bboxPolygon(bbox);
      // }

      // Once we reach the batch size, keep adding features as long as
      //   they are in the batch bounding box.
      // if (bboxPoly && !turf.booleanContains(bboxPoly, feature)) {
      const { matches, osrm_dir } = await match(batch);

      if (matches) {
        const keepers = removeOverlaps(matches);
        const orderedMatches = _.sortBy(keepers, (f) => f.properties.pp_id);

        for (const matchFeature of orderedMatches) {
          yield { osrm_dir, matchFeature };
        }
      }

      // bboxPoly = null;
      batch.length = 0;
    }
  }

  // Last batch
  const { matches, osrm_dir } = (await match(batch)) || {};

  if (matches) {
    const keepers = removeOverlaps(matches);
    const orderedMatches = _.sortBy(keepers, (f) => f.properties.pp_id);

    for (const matchFeature of orderedMatches) {
      yield { osrm_dir, matchFeature };
    }
  }
}

module.exports = { matchSegmentedShapeFeatures };
