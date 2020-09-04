/* eslint-disable no-restricted-syntax, jsdoc/require-jsdoc */

const logger = require("../../services/Logger");

const dao = require("../../daos/GeoJsonGtfsDAO");

const timerId = "load gtfs as geojson";

const main = async () => {
  try {
    logger.time(timerId);
    dao.load();
    logger.timeEnd(timerId);
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
};

module.exports = main;
