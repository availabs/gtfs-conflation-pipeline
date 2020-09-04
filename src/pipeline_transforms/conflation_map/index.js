/* eslint-disable no-restricted-syntax, jsdoc/require-jsdoc */

const logger = require("../../services/Logger");

const dao = require("../../daos/ConflationMapDAO");

const timerId = "load OSM/RIS/NPMRDS conflation map";

const main = async ({ conflation_map_sqlite_db }) => {
  try {
    logger.time(timerId);
    dao.load(conflation_map_sqlite_db);
    logger.timeEnd(timerId);
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
};

module.exports = main;
