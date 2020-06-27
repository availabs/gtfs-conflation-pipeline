/* eslint-disable no-restricted-syntax, jsdoc/require-jsdoc */

const memoizeOne = require("memoize-one");

const db = require("../../../services/DbService");

const SCHEMA = require("./DATABASE_SCHEMA_NAME");

const getDowsForTrip = memoizeOne(trip_id => {
  const dows = db
    .prepare(
      `
      SELECT
          sunday,
          monday,
          tuesday,
          wednesday,
          thursday,
          friday,
          saturday
        FROM ${SCHEMA}.trips
          INNER JOIN ${SCHEMA}.calendar USING (service_id)
        WHERE ( trip_id = ? )
      ; `
    )
    .raw()
    .get([trip_id]);

  return dows;
});

module.exports = {
  getDowsForTrip
};
