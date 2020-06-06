const OutputDao = require('./OutputDao');

// DAOs are singletons.
let dao;

const getDAO = () => {
  if (dao) {
    return dao;
  }

  dao = new OutputDao();
  return dao;
};

module.exports = {
  getDAO
};
