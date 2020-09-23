/* eslint-disable no-await-in-loop, no-continue */

const assert = require("assert");
const { existsSync } = require("fs");
const { join } = require("path");

const OSRM = require("osrm");
const turf = require("@turf/turf");
const memoizeOne = require("memoize-one");
const _ = require("lodash");

const DISTANCE_SLICE_METHOD = "DISTANCE_SLICE_METHOD";
const BEARING_SLICE_METHOD = "BEARING_SLICE_METHOD";
const MATCH = "MATCH";
const ROUTE = "ROUTE";

// Max number of waypoints to add
const N = 10;
const LEN_DIFF_R_REJECT_TH = 0.05;
const SIMILARITY_THOLD = 0.008;

const splitLineStringUsingSmoothness = require("../../../../utils/splitLineStringUsingSmoothness");
const lineStringsComparator = require("../../../../utils/lineStringsComparator");

// osrmDir is in the console logged info when running shst match.
//   It contains the road network subgraph created to match
//   the set of features passed to shared streets.
const getOSRM = memoizeOne((osrmDir) => {
  try {
    const osrmFile = join(osrmDir, "graph.xml.osrm");

    if (!existsSync(osrmFile)) {
      console.log("graph.xml.osrm file does not exist");
      return null;
    }

    return new OSRM(osrmFile);
  } catch (err) {
    console.error(err);
    return null;
  }
});

const getOsrmMatch = (osrm, feature) =>
  new Promise((resolve) =>
    osrm.match(
      {
        coordinates: turf.getCoords(feature),
        geometries: "geojson",
        continue_straight: true,
        overview: "full",
        snapping: "any",
        // radiuses: osrmRouteCoords.map(() => 20),
        // tidy: true
      },
      (err, result) => {
        if (err) {
          return resolve(null);
        }

        try {
          const { matchings } = result;
          // console.log(JSON.stringify(matchings, null, 4));

          const matchCoords = _(matchings)
            .map("geometry.coordinates")
            .flattenDeep()
            .chunk(2)
            .filter((coord, i, coords) => !_.isEqual(coord, coords[i - 1]))
            .value();

          const newFeature =
            matchCoords.length > 1 ? turf.lineString(matchCoords) : null;

          return resolve(newFeature);
        } catch (err2) {
          console.error(err2);
          return resolve(null);
        }
      }
    )
  );

const getOsrmRoute = (osrm, feature) =>
  new Promise((resolve) =>
    osrm.route(
      {
        // alternatives: true,
        alternatives: false,
        coordinates: turf.getCoords(feature),
        geometries: "geojson",
        continue_straight: true,
        overview: "full",
        snapping: "any",
        tidy: true,
      },
      (err, result) => {
        if (err) {
          return resolve(null);
        }

        try {
          const { routes } = result;

          assert(routes.length === 1);

          const [
            {
              geometry: { coordinates: resultRouteCoords },
            },
          ] = routes;

          const newFeature = turf.lineString(
            resultRouteCoords.filter(
              (coord, i) => !_.isEqual(coord, resultRouteCoords[i - 1])
            )
          );

          return resolve(newFeature);
        } catch (err2) {
          // console.error(err2);
          return resolve(null);
        }
      }
    )
  );

const lineSliceByDistanceMethod = async ({ feature, osrmDir }, osrmMethod) => {
  const featureLength = turf.length(feature);

  const mappedOptions = [];

  for (let n = N; n >= 4; --n) {
    try {
      const waypointCoords = _.range(0, n).map((m) =>
        _.first(
          turf.getCoords(
            turf.lineSliceAlong(feature, (featureLength * m) / n, featureLength)
          )
        )
      );

      waypointCoords.push(_.last(turf.getCoords(feature)));

      const mutatedFeature = turf.lineString(waypointCoords);

      const osrm = getOSRM(osrmDir);

      if (!osrm) {
        continue;
      }

      const mapFn = osrmMethod === MATCH ? getOsrmMatch : getOsrmRoute;

      const osrmMapped = await mapFn(osrm, mutatedFeature);

      if (!osrmMapped) {
        return null;
      }

      const mappedLen = turf.length(osrmMapped);

      const lenRatio = Math.abs(featureLength - mappedLen) / featureLength;

      if (lenRatio <= LEN_DIFF_R_REJECT_TH) {
        osrmMapped.properties = feature.properties;
        mappedOptions.push({ osrmMapped, lenRatio });
      }
    } catch (err) {
      console.error(err);
    }
  }

  const mappings = _(mappedOptions)
    .sortBy("lenRatio")
    .map("osrmMapped")
    // .take(5)
    .value();

  return mappings;
};

const lineSliceByBearingMethod = async ({ feature, osrmDir }, osrmMethod) => {
  let osrm;

  try {
    osrm = getOSRM(osrmDir);

    if (!osrm) {
      return null;
    }
  } catch (err) {
    console.error(err);
    return null;
  }

  const bearingSplitSegments = splitLineStringUsingSmoothness(feature);
  const singleTurns = _.tail(bearingSplitSegments).map((f, i) => {
    // console.log(JSON.stringify({ bearingSplitSegments, i }, null, 4));

    const prev = _.cloneDeep(bearingSplitSegments[i]);
    const prevCoords = turf.getCoords(prev);
    prevCoords.push(...f.geometry.coordinates);

    return prev;
  });

  bearingSplitSegments.push(...singleTurns);

  const chunkedBearingSplitSegments = _.flattenDeep(
    bearingSplitSegments.map((f) => {
      const featureLen = turf.length(f);
      const { features: chunkedFeatures } = turf.lineChunk(f, 2.5); // 2.5KM

      if (chunkedFeatures.length > 1) {
        const lastChunk = _.last(chunkedFeatures);
        const lastChunkLen = turf.length(lastChunk);
        if (lastChunkLen < 1) {
          const fullLastChunk = turf.lineSliceAlong(
            lastChunk,
            featureLen - 2.5,
            featureLen
          );

          chunkedFeatures.push(fullLastChunk);
        }

        return chunkedFeatures;
      }

      return null;
    })
  ).filter((f) => f);

  bearingSplitSegments.push(...chunkedBearingSplitSegments);

  const mappedOptions = [];

  try {
    const mapFn = osrmMethod === MATCH ? getOsrmMatch : getOsrmRoute;

    // [getOsrmRoute].map(async mapFn => {
    const osrmMappedFeatures = await Promise.all(
      bearingSplitSegments.map((seg) => mapFn(osrm, seg))
    );

    // console.log(JSON.stringify(osrmMappedFeatures, null, 4));
    if (!Array.isArray(osrmMappedFeatures)) {
      return null;
    }

    osrmMappedFeatures.map((mappedFeature, i) => {
      const sliceFeature = bearingSplitSegments[i];

      const mappedLen = mappedFeature ? turf.length(mappedFeature) : 0;

      const sliceLen = turf.length(sliceFeature);

      const lenRatio = Math.abs(sliceLen - mappedLen) / sliceLen;

      const similarity = mappedFeature
        ? lineStringsComparator(sliceFeature, mappedFeature)
        : Infinity;

      const f =
        lenRatio <= LEN_DIFF_R_REJECT_TH && similarity <= SIMILARITY_THOLD
          ? mappedFeature
          : sliceFeature;

      f.properties = _.cloneDeep(feature.properties);

      f.properties.pp_len_ratio = lenRatio;
      f.properties.pp_similarity = similarity;

      return f;
    });

    mappedOptions.push(...osrmMappedFeatures);
  } catch (err) {
    console.error(err);
  }

  const mappings = _(mappedOptions)
    .filter(_.negate(_.isNil))
    .uniqWith((a, b) => _.isEqual(turf.getCoords(a), turf.getCoords(b)))
    .value();

  return mappings;
};

const replaceFeaturesGeomsWithOsrmRoute = async (
  params,
  // {lineSliceMethod = DISTANCE_SLICE_METHOD, osrmMethod = ROUTE} = {}
  { lineSliceMethod = DISTANCE_SLICE_METHOD, osrmMethod = ROUTE } = {}
) => {
  if (lineSliceMethod === DISTANCE_SLICE_METHOD) {
    return lineSliceByDistanceMethod(params, osrmMethod);
  }

  if (lineSliceMethod === BEARING_SLICE_METHOD) {
    return lineSliceByBearingMethod(params, osrmMethod);
  }

  return null;
};

module.exports = replaceFeaturesGeomsWithOsrmRoute;
