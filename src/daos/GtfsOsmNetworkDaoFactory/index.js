const GtfsOsmNetworkDAO = require('./GtfsOsmNetworkDAO');

// DAOs are singletons.
let dao;

const getDAO = () => {
  if (dao) {
    return dao;
  }

  dao = new GtfsOsmNetworkDAO();
  return dao;
};

module.exports = {
  getDAO
};
