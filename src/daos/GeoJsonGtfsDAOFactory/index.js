const GeoJsonGtfsDAO = require('./GeoJsonGtfsDAO');

// DAOs are singletons.
let dao;

const getDAO = () => {
  if (dao) {
    return dao;
  }

  dao = new GeoJsonGtfsDAO();
  return dao;
};

module.exports = {
  getDAO
};
