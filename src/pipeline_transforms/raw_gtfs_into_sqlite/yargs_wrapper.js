/* eslint-disable global-require */

const command = "load_raw_gtfs_into_sqlite";
const desc = "Load the GTFS files into a SQLite Database.";

const builder = {
  agency_name: {
    desc: "Transit agency name",
    type: "string",
    demand: true,
  },
  gtfs_zip: {
    desc: "Path to the GTFS zip archive.",
    type: "string",
    demand: true,
  },
};

module.exports = {
  command,
  desc,
  builder,
  handler: (...args) => require("./index")(...args),
};
