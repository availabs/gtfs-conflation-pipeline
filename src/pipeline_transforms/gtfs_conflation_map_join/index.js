/* eslint-disable no-restricted-syntax, jsdoc/require-jsdoc */

const dao = require("../../daos/GtfsConflationMapJoinDAO");

const timerId = "join GTFS shapes to conflation map";

const main = async () => {
  try {
    console.time(timerId);
    dao.load();
    console.timeEnd(timerId);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

module.exports = main;
