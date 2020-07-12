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
        feature
      FROM ${SCHEMA}.tmp_shst_match_features
      WHERE (
        json_extract(feature, '$.properties.pp_shape_id')
          IN (${shapeIds.map(() => "?")})
      ) ;
  `);

  console.log(JSON.stringify({ _shapeIds }, null, 4));

  const result = query
    .raw()
    .all(_shapeIds)
    .map(([feature]) => JSON.parse(feature));

  console.log(JSON.stringify(result, null, 4));

  const seenCompositeKeys = new Set();

  const byByShapeIdxShapeId = result.reduce((acc, feature) => {
    // Remove the gis* properties that aren't useful.
    feature.properties = _.omit(feature.properties, (_v, k) =>
      k.startsWith("gis")
    );

    const {
      properties: { pp_shape_id, pp_shape_index, pp_match_index }
    } = feature;

    const compositKey = `${pp_shape_id}|${pp_shape_index}|${pp_match_index}`;

    if (seenCompositeKeys.has(compositKey)) {
      throw new Error("compositKeys are not UNIQUE");
    }

    seenCompositeKeys.add(compositKey);

    acc[pp_shape_id] = acc[pp_shape_id] || {};
    acc[pp_shape_id][pp_shape_index] = acc[pp_shape_id][pp_shape_index] || [];

    acc[pp_shape_id][pp_shape_index][pp_match_index] = feature;

    return acc;
  }, {});

  console.log(JSON.stringify(byByShapeIdxShapeId, null, 4));

  return byByShapeIdxShapeId;
}

function getMatchedMap() {
  // https://github.com/JoshuaWise/better-sqlite3/issues/283#issuecomment-511046320
  const query = db.prepare(`
    SELECT
      (
        '[' ||
        group_concat( DISTINCT feature ) ||
        ']'
      ) AS shst_ref_fragments
      FROM ${SCHEMA}.tmp_shst_match_features
        INNER JOIN ${SCHEMA}.tmp_gtfs_network_matches USING (shst_reference, section_start, section_end)
      GROUP BY json_extract(feature, '$.properties.shstReferenceId')
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
