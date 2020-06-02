const memoizeOne = require('memoize-one');

const GeoJsonGtfsDAO = require('./GeoJsonGtfsDAO');

// DAOs are singletons
const getDAO = memoizeOne(() => new GeoJsonGtfsDAO());

module.exports = {
  getDAO
};
