const main = require('./index');

const command = 'gtfs_network';
const desc = 'Snap GeoJSON GTFS Stops to GTFS shapes to create a network';

const handler = main;

module.exports = {
  command,
  desc,
  handler
};
