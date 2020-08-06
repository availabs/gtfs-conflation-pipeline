const logger = require("../../services/Logger");

const OutputDaoFactory = require("../../daos/OutputDaoFactory");

const main = async ({ output_file }) => {
  try {
    const outputDao = OutputDaoFactory.getDAO();
    logger.time("output_shapefile");
    outputDao.outputShapefile(output_file);
    logger.timeEnd("output_shapefile");
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
};

module.exports = main;
