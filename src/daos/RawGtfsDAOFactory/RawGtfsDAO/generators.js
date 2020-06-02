/* eslint-disable jsdoc/require-jsdoc */

const db = require('../../../services/DbService');

const SCHEMA = require('./DATABASE_SCHEMA_NAME');

function makeStopsIterator() {
  const stopsIteratorQuery = db.prepare(`
    SELECT *
      FROM ${SCHEMA}.stops
      ORDER BY stop_id ;`);

  return stopsIteratorQuery.iterate();
}

function makeShapesIterator() {
  const shapesIteratorQuery = db.prepare(`
    SELECT *
      FROM ${SCHEMA}.shapes ;`);

  return shapesIteratorQuery.iterate();
}

module.exports = {
  makeStopsIterator,
  makeShapesIterator
};
