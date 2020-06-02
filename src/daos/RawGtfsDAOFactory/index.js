const memoizeOne = require('memoize-one');

const RawGtfsDAO = require('./RawGtfsDAO');

// DAOs are singletons
const getDAO = memoizeOne(() => new RawGtfsDAO());

module.exports = {
  getDAO
};
