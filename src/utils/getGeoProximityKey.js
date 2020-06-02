const _ = require('lodash');

/**
 * Creates quadkey-style hash for GeoJSON Point or LineString
 * (Allows the SQLite database to retrieve in geospatial order)
 * See: https://docs.microsoft.com/en-us/azure/azure-maps/zoom-levels-and-tile-grid?tabs=csharp#quadkey-indices
 *
 * @param { GeoJSON.Point | GeoJSON.LineString } feature GeoJSON feature
 * @returns { string } quadkey-style hash of the feature's coordinates
 */
const getGeoProximityKeyPrefix = ({ geometry: { coordinates } }) => {
  // get the start coords
  const [lon, lat] = _.flattenDeep(coordinates);

  // convert start coords to hex
  const p_lon = _.round(Math.abs(+lon * 100000)).toString(16);
  const p_lat = _.round(Math.abs(+lat * 100000)).toString(16);

  // interleve hex
  const interleaved_coords = p_lon
    .split('')
    .reduce((acc, c, i) => `${acc}${c || 0}${p_lat[i] || 0}`, '');

  return interleaved_coords;
};

module.exports = getGeoProximityKeyPrefix;
