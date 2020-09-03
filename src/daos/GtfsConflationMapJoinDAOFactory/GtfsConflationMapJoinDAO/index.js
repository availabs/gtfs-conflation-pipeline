const assimilate = require("../../../utils/assimilate");

const loaders = require("./loaders");
const generators = require("./generators");

class GtfsScheduledTrafficDAO {
  constructor() {
    assimilate(this, {
      ...loaders,
      ...generators,
    });
  }
}

module.exports = GtfsScheduledTrafficDAO;
