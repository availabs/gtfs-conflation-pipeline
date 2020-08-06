const main = require("./index");

const command = "output_shapefile";
const desc = "Output pipeline stage output as Esri shapefile";

const builder = {
  output_file: {
    desc: "File path of output shapefile",
    type: "string",
    demand: true
  }
};

const handler = main;

module.exports = {
  command,
  desc,
  builder,
  handler
};
