/* eslint-disable global-require */

const command = "gtfs_network";
const desc = "Snap GeoJSON GTFS Stops to GTFS shapes to create a network";

module.exports = {
  command,
  desc,
  handler: (...args) => require("./index")(...args),
};
