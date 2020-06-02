const db = require('../../../services/DbService');

const assimilate = require('../../../utils/assimilate');

const DATABASE_SCHEMA_NAME = require('./DATABASE_SCHEMA_NAME');

const schemaQueries = require('./schemaQueries');
const loaders = require('./loaders');
const generators = require('./generators');

class RawGtfsDAO {
  constructor() {
    db.attachDatabase(DATABASE_SCHEMA_NAME);

    assimilate(this, {
      ...schemaQueries,
      ...generators,
      ...loaders
    });
  }
}

module.exports = RawGtfsDAO;
