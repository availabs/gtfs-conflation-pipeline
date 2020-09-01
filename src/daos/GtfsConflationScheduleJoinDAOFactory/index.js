const Dao = require("./GtfsConflationScheduleJoinDAO");

// DAOs are singletons.
let dao;

const getDAO = () => {
  if (dao) {
    return dao;
  }

  dao = new Dao();
  return dao;
};

module.exports = {
  getDAO,
};
