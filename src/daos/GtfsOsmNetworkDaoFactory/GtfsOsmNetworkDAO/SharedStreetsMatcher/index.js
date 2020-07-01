/* eslint-disable no-restricted-syntax, no-await-in-loop, jsdoc/require-jsdoc */

const turf = require("@turf/turf");
const _ = require("lodash");

const BATCH_SIZE = 25;

const shstMatchFeatures = require("./shstMatchFeatures");

const initializeUnmatchedFeaturesArray = features =>
  Array.isArray(features) && features.length
    ? features.reduce((acc, feature) => {
        const {
          id,
          properties,
          geometry: { coordinates }
        } = feature;

        // If there are no coordinates, can't match it to OSM.
        if (!(Array.isArray(coordinates) && coordinates.length)) {
          return acc;
        }

        // SharedStreets does not preserve the feature id.
        // It does perserve the input feature properties.
        // Therefore, we need to ensure that there is an "id"
        //   in the feature properties.
        if (properties.id !== undefined) {
          // No need to add id to properties
          acc.push(feature);
        } else {
          // If there is no id, we cannot proceed
          if (id === undefined) {
            throw new Error(
              "An id must be defined on the feature or in its properties."
            );
          }
          // add id to feature properties without mutating input feature
          acc.push({ ...feature, properties: { ...properties, id } });
        }

        return acc;
      }, [])
    : null;

async function match(features) {
  const unmatchedFeatures = initializeUnmatchedFeaturesArray(features);

  return _.isEmpty(unmatchedFeatures)
    ? null
    : shstMatchFeatures(unmatchedFeatures);
}

const removeOverlaps = matches => {
  const matchesByTargetMapId = matches.reduce((acc, matchFeature) => {
    const {
      properties: { pp_id }
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

    // sorth the match features array in descending order by coord arr len
    matchesByTargetMapId[tmId].sort(
      (a, b) =>
        turf.getCoords(b).length - turf.getCoords(a).length ||
        a.properties.pp_osrm_assisted - b.properties.pp_osrm_assisted
    );

    const matchesByShstRef = matchesByTargetMapId[tmId].reduce(
      (acc, matchFeature) => {
        const {
          properties: { shstReferenceId, pp_osrm_assisted }
        } = matchFeature;

        if (acc[shstReferenceId]) {
          const otherFeatures = acc[shstReferenceId];

          const coords = turf.getCoords(matchFeature);
          const coordsRounded = _(coords)
            .flattenDeep()
            .map(c => _.round(c, 5))
            .chunk(2)
            .value();

          if (
            !otherFeatures.some(other => {
              const {
                properties: { pp_osrm_assisted: otherOsrmAssisted }
              } = other;
              const otherCoords = turf.getCoords(other);

              if (!pp_osrm_assisted && !otherOsrmAssisted) {
                return _.differenceWith(coords, otherCoords, _.isEqual);
              }

              const otherCoordsRounded = _(otherCoords)
                .flattenDeep()
                .map(c => _.round(c, 5))
                .chunk(2)
                .value();

              return _.differenceWith(
                coordsRounded,
                otherCoordsRounded,
                _.isEqual
              );
            })
          ) {
            otherFeatures.push(matchFeature);
          }
        } else {
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
  let bboxPoly = null;

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
        const orderedMatches = _.sortBy(keepers, f => f.properties.pp_id);

        for (const matchFeature of orderedMatches) {
          yield { osrm_dir, matchFeature };
        }
      }

      bboxPoly = null;
      batch.length = 0;
    }
  }

  // Last batch
  const { matches, osrm_dir } = (await match(batch)) || {};

  if (matches) {
    const keepers = removeOverlaps(matches);
    const orderedMatches = _.sortBy(keepers, f => f.properties.pp_id);

    for (const matchFeature of orderedMatches) {
      yield { osrm_dir, matchFeature };
    }
  }
}

module.exports = { matchSegmentedShapeFeatures };
