/* eslint-disable no-restricted-syntax, jsdoc/require-jsdoc */

const db = require('../../../services/DbService');

const SCHEMA = require('./DATABASE_SCHEMA_NAME');

function* toParsedFeaturesIterator(iter) {
  for (const [feature] of iter) {
    yield JSON.parse(feature);
  }
}

function makeStopsIterator() {
  const stopsIteratorQuery = db.prepare(`
    SELECT
        feature
      FROM ${SCHEMA}.stops
      ORDER BY geoprox_key ;`);

  const iter = stopsIteratorQuery.raw().iterate();
  return toParsedFeaturesIterator(iter);
}

function makeShapesIterator() {
  const stopsIteratorQuery = db.prepare(`
    SELECT
        feature
      FROM ${SCHEMA}.shapes
      ORDER BY geoprox_key ;`);

  const iter = stopsIteratorQuery.raw().iterate();
  return toParsedFeaturesIterator(iter);
}

module.exports = {
  makeStopsIterator,
  makeShapesIterator
};
