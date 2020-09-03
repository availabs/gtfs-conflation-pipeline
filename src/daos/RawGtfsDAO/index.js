const loaders = require("./loaders");
const generators = require("./generators");
const getters = require("./getters");

module.exports = {
  ...loaders,
  ...generators,
  ...getters,
};
