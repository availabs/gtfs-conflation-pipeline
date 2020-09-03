/* eslint-disable no-restricted-syntax, jsdoc/require-jsdoc */

const logger = require("../../services/Logger");

const dao = require("../../daos/GeoJsonGtfsDAO");

const main = async () => {
  try {
    logger.time("load gtfs as geojson");
    dao.load();
    logger.timeEnd("load gtfs as geojson");
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
};

module.exports = main;
