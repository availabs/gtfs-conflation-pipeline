const assimilate = require('../../../utils/assimilate');

const generators = require('./generators');

class GtfsNetworkDAO {
  constructor() {
    assimilate(this, {
      ...generators
    });
  }
}

module.exports = GtfsNetworkDAO;
