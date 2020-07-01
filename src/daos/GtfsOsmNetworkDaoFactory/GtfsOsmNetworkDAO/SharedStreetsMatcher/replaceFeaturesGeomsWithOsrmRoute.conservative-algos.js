/* eslint-disable no-await-in-loop, no-continue */

const assert = require("assert");
const { existsSync } = require("fs");
const { join } = require("path");

const OSRM = require("osrm");
const turf = require("@turf/turf");
const memoizeOne = require("memoize-one");
const _ = require("lodash");

// Max number of waypoints to add
const N = 10;

// TODO: Replace these with ST_HausdorffDistance thresholds.
// Length difference ratio thresholds
// If len diff ratio exceeds LEN_DIFF_R_ACCEPT_TH, do not accept it
const LEN_DIFF_R_REJECT_TH = 0.15;

const getOSRM = memoizeOne(osrmDir => {
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

// const getMatch = (osrm, feature, osrmRouteCoords) =>
// new Promise((resolve, reject) =>
// osrm.match(
// {
// coordinates: osrmRouteCoords,
// geometries: "geojson",
// continue_straight: true,
// overview: "full",
// // snapping: "any",
// radiuses: osrmRouteCoords.map(() => 10),
// tidy: true
// },
// (err, result) => {
// if (err) {
// return reject(err);
// }

// try {
// const { matchings } = result;

// const matchCoords = _(matchings)
// .map("geometry.coordinates")
// .flattenDeep()
// .chunk(2)
// .filter((coord, i, coords) => !_.isEqual(coord, coords[i - 1]))
// .value();

// const newFeature = turf.lineString(matchCoords, feature.properties, {
// id: feature.id
// });

// return resolve(newFeature);
// } catch (err2) {
// console.error(err2);
// return resolve(null);
// }
// }
// )
// );

const getRoute = (osrm, feature, osrmRouteCoords) =>
  new Promise((resolve, reject) =>
    osrm.route(
      {
        alternatives: true,
        coordinates: osrmRouteCoords,
        geometries: "geojson",
        continue_straight: true,
        overview: "full",
        snapping: "any",
        tidy: true
      },
      (err, result) => {
        if (err) {
          return reject(err);
        }

        try {
          const { routes } = result;

          assert(routes.length === 1);

          const [
            {
              geometry: { coordinates: resultRouteCoords }
            }
          ] = routes;

          const newFeature = turf.lineString(
            // remove redundant points
            resultRouteCoords.filter(
              (coord, i) => !_.isEqual(coord, resultRouteCoords[i - 1])
            ),
            feature.properties,
            {
              id: feature.id
            }
          );

          return resolve(newFeature);
        } catch (err2) {
          console.error(err2);
          return resolve(null);
        }
      }
    )
  );

const replaceFeaturesGeomsWithOsrmRoute = async ({ feature, osrmDir }) => {
  const featureLength = turf.length(feature);

  const mappedOptions = [];

  for (let n = N; n >= 3; --n) {
    const waypointCoords = _.range(0, n).map(m =>
      _.first(
        turf.getCoords(
          turf.lineSliceAlong(feature, (featureLength * m) / n, featureLength)
        )
      )
    );

    waypointCoords.push(_.last(turf.getCoords(feature)));

    const osrm = getOSRM(osrmDir);

    if (!osrm) {
      return null;
    }

    await Promise.all(
      // [getMatch, getRoute].map(async mapFn => {
      [getRoute].map(async mapFn => {
        const osrmMapped = await mapFn(osrm, feature, waypointCoords);

        if (!osrmMapped) {
          return;
        }

        const mappedLen = turf.length(osrmMapped);

        const lenRatio = Math.abs(featureLength - mappedLen) / featureLength;

        if (lenRatio <= LEN_DIFF_R_REJECT_TH) {
          mappedOptions.push({ osrmMapped, lenRatio });
        }
      })
    );
  }

  const mappings = _(mappedOptions)
    .sortBy("lenRatio")
    .map("osrmMapped")
    // .take(5)
    .value();

  return mappings;
};

module.exports = replaceFeaturesGeomsWithOsrmRoute;
