/* eslint-disable no-restricted-syntax, jsdoc/require-jsdoc */

const logger = require('../../services/Logger');

const GeoJsonGtfsDAOFactory = require('../../daos/GeoJsonGtfsDAOFactory');

const main = async () => {
  try {
    const geoJsonGtfsDAO = GeoJsonGtfsDAOFactory.getDAO();
    logger.time('load gtfs as geojson');
    geoJsonGtfsDAO.load({ clean: true });
    logger.timeEnd('load gtfs as geojson');
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
};

module.exports = main;
