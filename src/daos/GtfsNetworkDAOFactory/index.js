const GtfsNetworkDAO = require('./GtfsNetworkDAO');

// DAOs are singletons.
let dao;

const getDAO = () => {
  if (dao) {
    return dao;
  }

  dao = new GtfsNetworkDAO();
  return dao;
};

module.exports = {
  getDAO
};
