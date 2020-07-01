const main = require('./index');

const command = 'gtfs_osm_network';
const desc = 'Snap GTFS shapes segmented at stops conflated to OSM';

const handler = main;

module.exports = {
  command,
  desc,
  handler
};
