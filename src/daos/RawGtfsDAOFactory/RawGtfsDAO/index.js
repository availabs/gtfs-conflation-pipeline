const db = require("../../../services/DbService");

const assimilate = require("../../../utils/assimilate");

const DATABASE_SCHEMA_NAME = require("./DATABASE_SCHEMA_NAME");

const schemaQueries = require("./schemaQueries");
const loaders = require("./loaders");
const generators = require("./generators");
const getters = require("./getters");

class RawGtfsDAO {
  constructor() {
    db.attachDatabase(DATABASE_SCHEMA_NAME);

    assimilate(this, {
      ...schemaQueries,
      ...loaders,
      ...generators,
      ...getters
    });
  }
}

module.exports = RawGtfsDAO;
