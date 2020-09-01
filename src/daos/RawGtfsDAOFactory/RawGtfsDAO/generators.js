/* eslint-disable no-restricted-syntax, jsdoc/require-jsdoc */

const db = require("../../../services/DbService");

const SCHEMA = require("./DATABASE_SCHEMA_NAME");

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

function makeScheduledStopsIterator() {
  return db
    .prepare(
      `
        SELECT
            service_id,
            trip_id,
            shape_id,
            stop_id,
            stop_sequence,
            arrival_time,
            departure_time
          FROM ${SCHEMA}.trips
            INNER JOIN ${SCHEMA}.stop_times USING (trip_id)
          ORDER BY trip_id, stop_sequence ;`
    )
    .iterate();
}

module.exports = {
  makeStopsIterator,
  makeShapesIterator,
  makeScheduledStopsIterator,
};
