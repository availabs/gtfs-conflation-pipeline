const GtfsScheduledTrafficDAO = require("./GtfsScheduledTrafficDAO");

// DAOs are singletons.
let dao;

const getDAO = () => {
  if (dao) {
    return dao;
  }

  dao = new GtfsScheduledTrafficDAO();
  return dao;
};

module.exports = {
  getDAO
};
