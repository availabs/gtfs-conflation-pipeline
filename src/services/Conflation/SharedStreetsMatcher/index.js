/* eslint-disable no-restricted-syntax, no-await-in-loop, jsdoc/require-jsdoc */

const _ = require("lodash");

const BATCH_SIZE = 25;

const shstMatchFeatures = require("./shstMatchFeatures");
const removeRedundantMatches = require("./removeRedundantMatches");

const initializeUnmatchedFeaturesArray = (features) =>
  Array.isArray(features) && features.length
    ? features.reduce((acc, feature) => {
        const {
          id,
          properties,
          geometry: { coordinates },
        } = feature;

        // SharedStreets does not preserve the feature id.
        // However, it perserves the input feature properties.
        // Therefore, we ensure that there is an "id" in the feature properties.

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

        // If there are no coordinates, can't match it to OSM.
        if (!(Array.isArray(coordinates) && coordinates.length)) {
          return acc;
        }

        acc.push({ ...feature, properties: { ...properties, id: featureId } });

        return acc;
      }, [])
    : null;

const match = async (features) => {
  const unmatchedFeatures = initializeUnmatchedFeaturesArray(features);

  return _.isEmpty(unmatchedFeatures)
    ? null
    : shstMatchFeatures(unmatchedFeatures);
};

const handleMatches = (matches) => {
  const keepers = removeRedundantMatches(matches);
  const orderedMatches = _.sortBy(keepers, (f) => f.properties.pp_id);
  return orderedMatches;
};

async function* matchSegmentedShapeFeatures(featuresIterator) {
  const batch = [];

  for (const feature of featuresIterator) {
    batch.push(feature);

    if (batch.length === BATCH_SIZE) {
      try {
        const { matches, osrm_dir } = (await match(batch)) || {};

        if (matches) {
          const orderedMatches = handleMatches(matches);

          for (const matchFeature of orderedMatches) {
            yield { osrm_dir, matchFeature };
          }
        }
      } catch (err) {
        console.error(err);
      }

      batch.length = 0;
    }
  }

  // Last batch
  const { matches, osrm_dir } = (await match(batch)) || {};

  if (matches) {
    try {
      const orderedMatches = handleMatches(matches);

      for (const matchFeature of orderedMatches) {
        yield { osrm_dir, matchFeature };
      }
    } catch (err) {
      console.error(err);
    }
  }
}

module.exports = { matchSegmentedShapeFeatures };
