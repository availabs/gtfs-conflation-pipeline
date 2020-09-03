const assimilate = require("../../../utils/assimilate");

const loaders = require("./loaders");

class ConflationMapDAO {
  constructor() {
    assimilate(this, {
      ...loaders,
    });
  }
}

module.exports = ConflationMapDAO;
