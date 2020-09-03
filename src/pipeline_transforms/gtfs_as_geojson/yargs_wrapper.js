/* eslint-disable global-require */

const command = "gtfs_as_geojson";
const desc = "Transform the GTFS stops and shaped to GeoJSON Features";

module.exports = {
  command,
  desc,
  handler: (...args) => require("./index")(...args),
};
