/* eslint-disable no-restricted-syntax, jsdoc/require-jsdoc */

const turf = require("@turf/turf");
const _ = require("lodash");

const db = require("../../../services/DbService");

const SCHEMA = require("./DATABASE_SCHEMA_NAME");

function getStopIdsInGeoOrder() {
  const query = db.prepare(`
    SELECT
        id
      FROM ${SCHEMA}.stops
      ORDER BY geoprox_key ;
  `);

  const result = _.flattenDeep(query.raw().all());

  return result;
}

function getGtfsMap() {
  const stops = _.flattenDeep(
    db
      .prepare(
        `
    SELECT
        feature
      FROM ${SCHEMA}.stops ;
  `
      )
      .raw()
      .all()
      .map(f => JSON.parse(f))
  );

  const shapes = _.flattenDeep(
    db
      .prepare(
        `
    SELECT
        feature
      FROM ${SCHEMA}.shapes ;
  `
      )
      .raw()
      .all()
      .map(f => JSON.parse(f))
  );

  return turf.featureCollection(Array.prototype.concat(stops, shapes));
}

module.exports = {
  getStopIdsInGeoOrder,
  getGtfsMap
};
