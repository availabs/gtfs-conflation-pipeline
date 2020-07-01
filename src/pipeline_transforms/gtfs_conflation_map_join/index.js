/* eslint-disable no-restricted-syntax, jsdoc/require-jsdoc */

const logger = require("../../services/Logger");

const DAOFactory = require("../../daos/GtfsConflationMapJoinDAOFactory");

const timerId = "join GTFS schedule to conflation map";

const main = async () => {
  try {
    const dao = DAOFactory.getDAO();
    logger.time(timerId);
    dao.load();
    logger.timeEnd(timerId);
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
};

module.exports = main;
