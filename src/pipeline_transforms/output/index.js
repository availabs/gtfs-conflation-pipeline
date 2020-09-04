const logger = require("../../services/Logger");

const dao = require("../../daos/OutputDAO");

const main = async ({ output_file }) => {
  try {
    logger.time("output_shapefile");
    dao.outputShapefile(output_file);
    logger.timeEnd("output_shapefile");
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
};

module.exports = main;
