const main = require("./index");

const command = "gtfs_conflation_map_join";
const desc =
  "Join the GTFS schedule data with the OSM/RIS/NPMRDS conflation map.";

const handler = main;

module.exports = {
  command,
  desc,
  handler,
};
