/* eslint-disable no-restricted-syntax, jsdoc/require-jsdoc */

const db = require("../../../services/DbService");

const SCHEMA = require("./DATABASE_SCHEMA_NAME");

function getNetwork() {
  const query = db.prepare(`
    SELECT
        feature
      FROM ${SCHEMA}.shape_segments
      -- WHERE ( shape_id = '1550299' )
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
  getSegmentedShape
};
