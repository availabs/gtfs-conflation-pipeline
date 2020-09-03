/* eslint-disable no-restricted-syntax, jsdoc/require-jsdoc */

const db = require("../../services/DbService");

const SCHEMA = require("./DATABASE_SCHEMA_NAME");

const N = 50;

function getNetwork() {
  const query = db.prepare(`
    SELECT
        feature
      FROM ${SCHEMA}.shape_segments
      -- WHERE ( shape_id = '130528' )
      -- WHERE ( shape_id = '130528' and shape_index = 0 )
      -- WHERE ( shape_id = '1170594' and shape_index = 9 )
      -- WHERE ( shape_id IN (SELECT DISTINCT shape_id from ${SCHEMA}.shape_segments ORDER BY shape_id LIMIT ${N}) )
    ; `);

  const result = query
    .raw()
    .all()
    .map(([feature]) => JSON.parse(feature));

  return result;
}

function getSegmentedShape(shapeId) {
  const query = db.prepare(`
    SELECT
        feature
      FROM ${SCHEMA}.shape_segments
      WHERE ( shape_id = ? )
      ORDER BY shape_index
    ; `);

  const result = query
    .raw()
    .all([shapeId])
    .map(([feature]) => JSON.parse(feature));

  return result;
}

module.exports = {
  getNetwork,
  getSegmentedShape,
};
