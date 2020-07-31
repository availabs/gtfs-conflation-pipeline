const turf = require("@turf/turf");
const _ = require("lodash");

// get the coords, removing adjacent equivalent coords
const getCoords = feature => {
  const type = turf.getType(feature);
  switch (type) {
    case "Point":
      return [turf.getCoord(feature)];
    case "LineString":
      return turf.getCoords(feature).reduce((acc, coord, i, coords) => {
        if (!_.isEqual(coord, coords[i - 1])) {
          acc.push(coord);
        }
        return acc;
      }, []);
    default:
      throw new Error(`Unsupported GeoJSON type: ${type}`);
  }
};

const featuresCoordsToIdArrays = (...args) => {
  const featuresCoords = args.map(getCoords);
  const featuresCoordsStrs = featuresCoords.map(coords =>
    coords.map(c => JSON.stringify(c))
  );

  // We assign IDs to each (lon, lat) pair in the
  //   Set UNION of the two LineString geometries.
  const coordIds = _.flattenDepth(featuresCoordsStrs, 2).reduce((acc, c, i) => {
    acc[c] = acc[c] || i;
    return acc;
  }, {});

  // Each LineString's geometry becomes the array of coordinate IDs.
  const idArrays = featuresCoordsStrs.map(coords =>
    coords.map(c => coordIds[c])
  );

  return args.length > 1 ? idArrays : idArrays[0];
};

module.exports = featuresCoordsToIdArrays;
