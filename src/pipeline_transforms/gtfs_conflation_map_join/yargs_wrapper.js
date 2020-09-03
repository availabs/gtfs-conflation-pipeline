/* eslint-disable global-require */

const command = "gtfs_conflation_map_join";
const desc =
  "Join the GTFS schedule data with the OSM/RIS/NPMRDS conflation map.";

module.exports = {
  command,
  desc,
  handler: (...args) => require("./index")(...args),
};
