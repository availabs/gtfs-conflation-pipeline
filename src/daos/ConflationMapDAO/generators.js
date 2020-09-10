/* eslint-disable no-restricted-syntax, jsdoc/require-jsdoc */

const turf = require("@turf/turf");

const db = require("../../services/DbService");

const SCHEMA = require("./DATABASE_SCHEMA_NAME");

function* makeConflationMapSegmentsWithinPolygonIterator(polygon) {
  if (!polygon) {
    throw new Error("requires polygon parameter");
  }

  const coords = turf.getCoords(polygon);

  if (coords.length !== 1) {
    throw new Error(
      "Invalid polygon passes to makeConflationMapSegmentsWithinPolygonIterator"
    );
  }

  const [queryPolygon] = coords;

  const iter = db
    .prepare(
      `
        SELECT
            feature
          FROM ${SCHEMA}.conflation_map
            INNER JOIN (
              SELECT
                  id
                FROM ${SCHEMA}.conflation_map_geopoly
                WHERE geopoly_overlap(_shape, ?)
            ) USING (id)
          ORDER BY id ;
      `
    )
    .raw()
    .iterate([JSON.stringify(queryPolygon)]);

  for (const [featureStr] of iter) {
    const feature = JSON.parse(featureStr);

    yield feature;
  }
}

module.exports = { makeConflationMapSegmentsWithinPolygonIterator };
