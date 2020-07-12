/* eslint-disable no-await-in-loop, no-continue, no-param-reassign */

const { existsSync } = require("fs");
const { join } = require("path");

const OSRM = require("osrm");
const turf = require("@turf/turf");
const memoizeOne = require("memoize-one");
const _ = require("lodash");

const lineStringsComparator = require("../../../../utils/lineStringsComparator");

// Max number of waypoints to add
const N = 20;

// TODO: Replace these with ST_HausdorffDistance thresholds.
// Length difference ratio thresholds
// If len diff ratio exceeds LEN_DIFF_R_ACCEPT_TH, do not accept it
const BEARING_RANGE = 15; // degrees
const SNAP_DIST_THOLD = 33; // meters
const SIMILARITY_THOLD = 0.01;

const getOSRM = memoizeOne(osrmDir => {
  try {
    const osrmFile = join(osrmDir, "graph.xml.osrm");

    if (!existsSync(osrmFile)) {
      console.error("graph.xml.osrm file does not exist");
      return null;
    }

    return new OSRM(osrmFile);
  } catch (err) {
    console.error(err);
    return null;
  }
});

// http://project-osrm.org/docs/v5.5.1/api/#services
// https://github.com/Project-OSRM/osrm-backend/blob/master/docs/nodejs/api.md#nearest
// https://github.com/Project-OSRM/osrm-backend/issues/5476
const getNearest = (osrm, point, bearing) =>
  new Promise(resolve => {
    const coord = turf.getCoord(point);

    osrm.nearest(
      {
        coordinates: [coord],
        bearings: [[bearing, BEARING_RANGE]],
        geometries: "geojson",
        snapping: "any",
        tidy: true
      },
      (err, result) => {
        if (err) {
          console.error(err);
          return resolve(coord);
        }

        try {
          const {
            waypoints: [{ distance, location }]
          } = result;

          return resolve(distance <= SNAP_DIST_THOLD ? location : coord);
        } catch (err2) {
          console.error(err2);
          return resolve(null);
        }
      }
    );
  });

const getMatch = (osrm, feature, osrmRouteCoords) =>
  new Promise((resolve, reject) =>
    osrm.match(
      {
        coordinates: osrmRouteCoords,
        geometries: "geojson",
        continue_straight: true,
        overview: "full",
        snapping: "any",
        radiuses: osrmRouteCoords.map(() => 10),
        tidy: true
      },
      (err, result) => {
        if (err) {
          return reject(err);
        }

        try {
          const { matchings } = result;

          const matchCoords = _(matchings)
            .map("geometry.coordinates")
            .flattenDeep()
            .chunk(2)
            .filter((coord, i, coords) => !_.isEqual(coord, coords[i - 1]))
            .value();

          const newFeature = turf.lineString(matchCoords, feature.properties, {
            id: feature.id
          });

          return resolve(newFeature);
        } catch (err2) {
          console.error(err2);
          return resolve(null);
        }
      }
    )
  );

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
          const newFeatures = [];

          routes.forEach(route => {
            const {
              geometry: { coordinates: resultRouteCoords }
            } = route;

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

            newFeatures.push(newFeature);
          });

          return resolve(newFeatures);
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

  const osrm = getOSRM(osrmDir);

  if (!osrm) {
    return null;
  }

  await Promise.all(
    _.range(3, N)
      .map(async n => {
        const waypointCoords = _.range(0, n).map(m =>
          _.first(
            turf.getCoords(
              turf.lineSliceAlong(
                feature,
                (featureLength * m) / n,
                featureLength
              )
            )
          )
        );

        waypointCoords.push(_.last(turf.getCoords(feature)));

        const waypoints = waypointCoords.map(coord => turf.point(coord));

        const waypointsWithBearings = waypoints.slice(0, -1);
        const bearings = waypointsWithBearings.map((p, i) => {
          const b = turf.bearing(p, waypoints[i + 1]);

          // TODO: Verify correctness
          return b >= 0 ? b : 360 + b;
        });

        const snappedWaypoints = await Promise.all(
          waypointsWithBearings.map((p, i) => getNearest(osrm, p, bearings[i]))
        );

        const routeWaypoints = Array.prototype.concat(snappedWaypoints, [
          turf.getCoord(_.last(waypoints))
        ]);

        const routesArr = await getRoute(osrm, feature, routeWaypoints);

        if (!Array.isArray(routesArr)) {
          return;
        }

        routesArr.forEach(route => {
          const similarity = lineStringsComparator(feature, route);

          if (similarity > SIMILARITY_THOLD) {
            return;
          }

          route.properties.pp_similarity = similarity;

          mappedOptions.push({ osrmMapped: route, similarity });
        });
      })
      .concat(async () => {
        const matchResult = await getMatch(
          osrm,
          feature,
          turf.getCoords(feature)
        );

        const similarity = lineStringsComparator(feature, matchResult);

        if (similarity > SIMILARITY_THOLD) {
          return;
        }

        matchResult.properties.pp_similarity = similarity;

        mappedOptions.push({ osrmMapped: matchResult, similarity });
      })
  );

  const mappings = _(mappedOptions)
    .uniqWith(({ osrmMapped: a }, { osrmMapped: b }) =>
      _.isEqual(turf.getCoords(a), turf.getCoords(b))
    )
    .sortBy("similarity")
    .map("osrmMapped")
    // .take(5)
    .value();

  return mappings;
};

module.exports = replaceFeaturesGeomsWithOsrmRoute;
