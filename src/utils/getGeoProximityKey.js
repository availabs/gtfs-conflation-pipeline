const _ = require("lodash");

// $ node
// > parseInt('1'.repeat((360 * 100000).toString(2).length * 2), 2).toString(32).length
// 11
const KEY_LEN = 11;

const getKey = (lon, lat) => {
  // convert start coords to hex
  const p_lon = _.round(Math.abs(+lon * 100000)).toString(2);
  const p_lat = _.round(Math.abs(+lat * 100000)).toString(2);

  // interleve hex
  const interleaved_coords = p_lon
    .split("")
    .reduce((acc, c, i) => `${acc}${c || 0}${p_lat[i] || 0}`, "");

  const key = _.padStart(
    parseInt(interleaved_coords, 2).toString(36),
    KEY_LEN,
    "0"
  );

  return key;
};

/**
 * Creates quadkey-style hash for GeoJSON Point or LineString
 * (Allows the SQLite database to retrieve in geospatial order)
 * See: https://docs.microsoft.com/en-us/azure/azure-maps/zoom-levels-and-tile-grid?tabs=csharp#quadkey-indices
 *
 * @param { GeoJSON.Point | GeoJSON.LineString } feature GeoJSON feature
 * @returns { string } quadkey-style hash of the feature's coordinates
 */
const getGeoProximityKeyPrefix = ({ geometry: { coordinates } }) => {
  const coordList = _.flattenDeep(coordinates);

  // get the start coords key
  const startKey = getKey(...coordList.slice(0, 2));

  // get the end coords key
  const endKey = getKey(...coordList.slice(-2));

  return startKey < endKey ? startKey : endKey;
};

module.exports = getGeoProximityKeyPrefix;
