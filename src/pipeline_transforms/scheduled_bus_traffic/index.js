/* eslint-disable no-restricted-syntax, jsdoc/require-jsdoc */

const dao = require("../../daos/GtfsScheduledTrafficDAO");

const timerId = "load schduled bus traffic";

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
