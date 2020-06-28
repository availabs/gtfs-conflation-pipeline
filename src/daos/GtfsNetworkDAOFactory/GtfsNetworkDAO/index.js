const db = require("../../../services/DbService");

const assimilate = require("../../../utils/assimilate");

const DATABASE_SCHEMA_NAME = require("./DATABASE_SCHEMA_NAME");

const loaders = require("./loaders");
const generators = require("./generators");
const getters = require("./getters");

class GtfsNetworkDAO {
  constructor() {
    db.attachDatabase(DATABASE_SCHEMA_NAME);

    assimilate(this, {
      ...loaders,
      ...generators,
      ...getters
    });
  }
}

module.exports = GtfsNetworkDAO;
