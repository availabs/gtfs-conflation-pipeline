/* eslint-disable no-restricted-syntax, jsdoc/require-jsdoc, no-underscore-dangle, no-param-reassign */

const turf = require("@turf/turf");
const _ = require("lodash");
const db = require("../../../services/DbService");

const SCHEMA = require("./DATABASE_SCHEMA_NAME");

/*
CREATE TABLE IF NOT EXISTS ${SCHEMA}.tmp_raw_shst_matches (
  shape_id       TEXT,
  shape_index    INTEGER,
  osrm_dir       TEXT,
  match_feature  TEXT
) ;
*/

function getShstMatchesForShapes(shapeIds) {
  const _shapeIds = (Array.isArray(shapeIds) ? shapeIds : [shapeIds]).filter(
    shpId => shpId
  );

  if (_.isEmpty(_shapeIds)) {
    return {};
  }

  // https://github.com/JoshuaWise/better-sqlite3/issues/283#issuecomment-511046320
  const query = db.prepare(`
    SELECT
        match_feature
      FROM ${SCHEMA}.tmp_raw_shst_matches
      WHERE ( shape_id IN (${shapeIds.map(() => "?")}) ) ;
  `);

  const result = query
    .raw()
    .all(_shapeIds)
    .map(([feature]) => JSON.parse(feature));

  const byByShapeIdxShapeId = result.reduce((acc, feature) => {
    // Remove the gis* properties that aren't useful.
    feature.properties = _.omit(feature.properties, (_v, k) =>
      k.startsWith("gis")
    );

    const {
      properties: { pp_shape_id, pp_shape_index, pp_match_index }
    } = feature;

    acc[pp_shape_id] = acc[pp_shape_id] || {};
    acc[pp_shape_id][pp_shape_index] = acc[pp_shape_id][pp_shape_index] || [];

    // acc[pp_shape_id][pp_shape_index][pp_match_index] = feature
    acc[pp_shape_id][pp_shape_index][pp_match_index] = feature;

    return acc;
  }, {});

  // console.log(JSON.stringify(byByShapeIdxShapeId, null, 4))

  return byByShapeIdxShapeId;
}

function getMatchedMap() {
  // https://github.com/JoshuaWise/better-sqlite3/issues/283#issuecomment-511046320
  const query = db.prepare(`
    SELECT
      (
        '[' ||
        group_concat( DISTINCT match_feature ) ||
        ']'
      ) AS shst_ref_fragments
      FROM ${SCHEMA}.tmp_raw_shst_matches
      GROUP BY json_extract(match_feature, '$.properties.shstReferenceId')
  `);

  const geoComparator = (a, b) =>
    _.get(a, ["properties", "shstReferenceId"], 1) ===
      _.get(b, ["properties", "shstReferenceId"], 1) &&
    _.difference(turf.getCoords(b), turf.getCoords(a)).length === 0;

  const all = _.flattenDeep(
    // _.uniqWith(
    query
      .raw()
      .all()
      .map(([featureArr]) =>
        _.uniqWith(
          JSON.parse(featureArr).sort((a, b) => b.length - a.length),
          geoComparator
        )
      )
  );
  // geoComparator
  // );

  return turf.featureCollection(all);
}

module.exports = {
  getShstMatchesForShapes,
  getMatchedMap
};
