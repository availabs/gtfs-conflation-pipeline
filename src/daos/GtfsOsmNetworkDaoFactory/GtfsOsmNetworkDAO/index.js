const assimilate = require("../../../utils/assimilate");

const loaders = require("./loaders");
const generators = require("./generators");
const getters = require("./getters");

class GtfsOsmNetworkDAO {
  constructor() {
    assimilate(this, {
      ...loaders,
      ...generators,
      ...getters,
    });
  }
}

module.exports = GtfsOsmNetworkDAO;
