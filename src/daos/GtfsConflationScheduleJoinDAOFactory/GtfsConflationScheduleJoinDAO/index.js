const assimilate = require("../../../utils/assimilate");

const loaders = require("./loaders");

class GtfsScheduledTrafficDAO {
  constructor() {
    assimilate(this, {
      ...loaders,
    });
  }
}

module.exports = GtfsScheduledTrafficDAO;
