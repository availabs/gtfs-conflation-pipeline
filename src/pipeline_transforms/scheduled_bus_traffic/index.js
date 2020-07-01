/* eslint-disable no-restricted-syntax, jsdoc/require-jsdoc */

const logger = require("../../services/Logger");

const GtfsScheduledTrafficDAOFactory = require("../../daos/GtfsScheduledTrafficDAOFactory");

const timerId = "load schduled bus traffic";

const main = async () => {
  try {
    const dao = GtfsScheduledTrafficDAOFactory.getDAO();
    logger.time(timerId);
    dao.load();
    logger.timeEnd(timerId);
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
};

module.exports = main;
