const assimilate = require("../../../utils/assimilate");

const schemaQueries = require("./schemaQueries");
const loaders = require("./loaders");
const generators = require("./generators");
const getters = require("./getters");

class RawGtfsDAO {
  constructor() {
    assimilate(this, {
      ...schemaQueries,
      ...loaders,
      ...generators,
      ...getters,
    });
  }
}

module.exports = RawGtfsDAO;
