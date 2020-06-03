/* eslint-disable no-restricted-syntax, jsdoc/require-jsdoc */

const logger = require('../../services/Logger');

const GeoJsonGtfsDAOFactory = require('../../daos/GeoJsonGtfsDAOFactory');

const geoJsonGtfsDAO = GeoJsonGtfsDAOFactory.getDAO();

const main = async () => {
  try {
    geoJsonGtfsDAO.load({ clean: true });
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
};

module.exports = main;
