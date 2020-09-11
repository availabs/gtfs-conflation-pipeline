const dao = require("../../daos/OutputDAO");

const main = async ({ output_file }) => {
  try {
    console.time("output_shapefile");
    dao.outputShapefile(output_file);
    console.timeEnd("output_shapefile");
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

module.exports = main;
