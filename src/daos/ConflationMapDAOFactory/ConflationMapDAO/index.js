const db = require("../../../services/DbService");

const assimilate = require("../../../utils/assimilate");

const SCHEMA = require("./DATABASE_SCHEMA_NAME");

const loaders = require("./loaders");

class ConflationMapDAO {
  constructor() {
    db.attachDatabase(SCHEMA);

    assimilate(this, {
      ...loaders
    });
  }
}

module.exports = ConflationMapDAO;
