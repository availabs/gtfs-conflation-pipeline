/* eslint-disable no-restricted-syntax, jsdoc/require-jsdoc */

const dao = require("../../daos/ConflationMapDAO");

const timerId = "load OSM/RIS/NPMRDS conflation map";

const main = async ({ conflation_map_sqlite_db }) => {
  try {
    console.time(timerId);
    dao.load(conflation_map_sqlite_db);
    console.timeEnd(timerId);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

module.exports = main;
