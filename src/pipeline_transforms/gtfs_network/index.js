/* eslint-disable no-restricted-syntax, jsdoc/require-jsdoc */

const logger = require("../../services/Logger");

const dao = require("../../daos/GtfsNetworkDAO");

const timerId = "load GTFS network";

const main = async () => {
  try {
    console.time(timerId);
    dao.load();
    console.timeEnd(timerId);
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
};

module.exports = main;
