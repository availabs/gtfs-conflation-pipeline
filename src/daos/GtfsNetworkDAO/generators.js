/* eslint-disable no-restricted-syntax, jsdoc/require-jsdoc */

const db = require("../../services/DbService");

const toParsedFeaturesIterator = require("../../utils/toParsedFeaturesIterator");

const SCHEMA = require("./DATABASE_SCHEMA_NAME");

const N = 50;

function makeShapeSegmentsIterator() {
  const iterQuery = db.prepare(`
    SELECT
        feature
      FROM ${SCHEMA}.shape_segments
      -- WHERE ( shape_id = '130528' )
      -- WHERE ( shape_id = '130528' and shape_index = 0 )
      -- WHERE ( shape_id = '1170594' and shape_index = 9 )
      -- WHERE ( shape_id IN (SELECT DISTINCT shape_id from ${SCHEMA}.shape_segments ORDER BY shape_id LIMIT ${N}) )
      ORDER BY geoprox_key
  `);

  const iter = iterQuery.raw().iterate();
  return toParsedFeaturesIterator(iter);
}

module.exports = {
  makeShapeSegmentsIterator,
};
