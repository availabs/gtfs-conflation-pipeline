/* eslint-disable no-restricted-syntax, jsdoc/require-jsdoc */

const logger = require("../../services/Logger");

const dao = require("../../daos/GtfsOsmNetworkDAO");

const timerId = "load gtfs-osm network";

const main = async () => {
  try {
    console.time(timerId);
    await dao.load();
    console.timeEnd(timerId);
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
};

module.exports = main;
