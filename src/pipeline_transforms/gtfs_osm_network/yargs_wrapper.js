/* eslint-disable global-require */

const command = "gtfs_osm_network";
const desc = "Snap GTFS shapes segmented at stops conflated to OSM";

module.exports = {
  command,
  desc,
  handler: (...args) => require("./index")(...args),
};
