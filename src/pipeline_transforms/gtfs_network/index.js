/* eslint-disable no-restricted-syntax, jsdoc/require-jsdoc */

const logger = require('../../services/Logger');

const GtfsNetworkDAOFactory = require('../../daos/GtfsNetworkDAOFactory');

const timerId = 'load GTFS network'

const main = async () => {
  try {
    const gtfsNetworkDAO = GtfsNetworkDAOFactory.getDAO();
    console.time(timerId);
    gtfsNetworkDAO.load();
    console.timeEnd(timerId);
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
};

module.exports = main;
