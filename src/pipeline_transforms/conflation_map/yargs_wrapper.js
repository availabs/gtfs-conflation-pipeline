/* eslint-disable global-require */

const command = "load_conflation_map";
const desc = "Load the OSM/RIS/NPMRDS conflation map";

const builder = {
  conflation_map_sqlite_db: {
    desc: "Path to the conflation map SQLite database.",
    type: "string",
    demand: true,
  },
};

module.exports = {
  command,
  desc,
  handler: (...args) => require("./index")(...args),
  builder,
};
