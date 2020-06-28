/* eslint-disable no-restricted-syntax, jsdoc/require-jsdoc */

const db = require("../../../services/DbService");

const toParsedFeaturesIterator = require("../../../utils/toParsedFeaturesIterator");

const SCHEMA = require("./DATABASE_SCHEMA_NAME");

function makeShapeSegmentsIterator() {
  const iterQuery = db.prepare(`
    SELECT
        feature
      FROM ${SCHEMA}.shape_segments
      ORDER BY geoprox_key
  `);

  const iter = iterQuery.raw().iterate();
  return toParsedFeaturesIterator(iter);
}

module.exports = {
  makeShapeSegmentsIterator
};
