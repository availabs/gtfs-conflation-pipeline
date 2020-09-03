/* eslint-disable no-restricted-syntax, jsdoc/require-jsdoc */

const logger = require("../../services/Logger");

const GtfsOsmNetworkDAO = require("../../daos/GtfsOsmNetworkDAO");

const main = async () => {
  try {
    console.time("load gtfs-osm network");
    await GtfsOsmNetworkDAO.load();
    console.timeEnd("load gtfs-osm network");
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
};

module.exports = main;
