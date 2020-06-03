const RawGtfsDAO = require('./RawGtfsDAO');

// DAOs are singletons.
let dao;

const getDAO = () => {
  if (dao) {
    return dao;
  }

  dao = new RawGtfsDAO();
  return dao;
};

module.exports = {
  getDAO
};
