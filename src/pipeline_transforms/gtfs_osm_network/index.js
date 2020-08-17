/* eslint-disable no-restricted-syntax, jsdoc/require-jsdoc */

const logger = require("../../services/Logger");

const GtfsOsmNetworkDAOFactory = require("../../daos/GtfsOsmNetworkDaoFactory");

const main = async () => {
  try {
    const gtfsOsmNetworkDAO = GtfsOsmNetworkDAOFactory.getDAO();

    console.time("load gtfs-osm network");
    await gtfsOsmNetworkDAO.load();
    console.timeEnd("load gtfs-osm network");
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
};

module.exports = main;
