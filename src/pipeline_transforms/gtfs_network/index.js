/* eslint-disable no-restricted-syntax, jsdoc/require-jsdoc */

const logger = require('../../services/Logger');

const GtfsNetworkDAOFactory = require('../../daos/GtfsNetworkDAOFactory');

const main = async () => {
  try {
    const gtfsNetworkDAO = GtfsNetworkDAOFactory.getDAO();
    console.time('load gtfs network');
    gtfsNetworkDAO.load({ clean: true });
    console.timeEnd('load gtfs network');
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
};

module.exports = main;
