const _ = require("lodash");

const removeRedundantCoords = (coords) =>
  coords.filter((coord, i) => !_.isEqual(coords[i - 1], coord));

module.exports = removeRedundantCoords;
