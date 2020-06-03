const main = require('./index');

const command = 'gtfs_as_geojson';
const desc = 'Transform the GTFS stops and shaped to GeoJSON Features';

const handler = main;

module.exports = {
  command,
  desc,
  handler
};
