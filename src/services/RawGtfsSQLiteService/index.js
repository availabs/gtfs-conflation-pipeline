/* eslint no-restricted-syntax: 0 */

const RawGtfsDbService = require('./RawGtfsDbService')

// The dbServices are singletons
const dbServices = {};

const getDbService = sqlite_dir => {
  let db = dbServices[sqlite_dir];

  if (db) {
    return dbServices[sqlite_dir];
  }

  db = new RawGtfsDbService(sqlite_dir);
  dbServices[sqlite_dir] = db;

  return db;
};

module.exports = {
  getDbService
};
