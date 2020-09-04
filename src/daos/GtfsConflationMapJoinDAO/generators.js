/* eslint-disable no-restricted-syntax, jsdoc/require-jsdoc, no-param-reassign */

/*
    conflation_map> \d conflation_map
    +-----+----------------+---------+---------+------------+----+
    | cid | name           | type    | notnull | dflt_value | pk |
    +-----+----------------+---------+---------+------------+----+
    | 0   | id             | INTEGER | 1       | <null>     | 1  |
    | 1   | shst_reference | TEXT    | 1       | <null>     | 0  |
    | 2   | feature        | TEXT    | 1       | <null>     | 0  |
    +-----+----------------+---------+---------+------------+----+

    gtfs_conflation_map_join> \d gtfs_matches_conflation_map_join
    +-----+-------------------+---------+---------+------------+----+
    | cid | name              | type    | notnull | dflt_value | pk |
    +-----+-------------------+---------+---------+------------+----+
    | 0   | id                | INTEGER | 0       | <null>     | 1  |
    | 1   | gtfs_shape_id     | INTEGER | 0       | <null>     | 0  |
    | 2   | gtfs_shape_index  | INTEGER | 0       | <null>     | 0  |
    | 3   | conflation_map_id | INTEGER | 0       | <null>     | 0  |
    | 4   | conf_map_post_len | REAL    | 0       | <null>     | 0  |
    | 5   | along_idx         | INTEGER | 0       | <null>     | 0  |
    +-----+-------------------+---------+---------+------------+----+
*/

const _ = require("lodash");
const turf = require("@turf/turf");

const db = require("../../services/DbService");

const {
  CONFLATION_MAP,
  GTFS_CONFLATION_MAP_JOIN,
} = require("../../constants/databaseSchemaNames");

const SLICE_THLD = 0.005;

function* makeGtfsConflationMapJoinIterator() {
  const iterQuery = db.prepare(`
      SELECT
          gtfs_shape_id,
          gtfs_shape_index,
          conf_map_pre_len,
          conf_map_post_len,
          a.feature
        FROM ${CONFLATION_MAP}.conflation_map AS a
          INNER JOIN ${GTFS_CONFLATION_MAP_JOIN}.gtfs_matches_conflation_map_join AS b
          ON ( a.id = b.conflation_map_id )
        ORDER BY
          b.gtfs_shape_id,
          b.gtfs_shape_index,
          b.along_idx
      ;
  `);

  const iter = iterQuery.raw().iterate();

  let id = 0;
  let curShapeId;
  let curShapeIdx;
  let acc;

  for (const [
    gtfs_shape_id,
    gtfs_shape_index,
    conf_map_pre_len,
    conf_map_post_len,
    featureStr,
  ] of iter) {
    const feature = JSON.parse(featureStr);

    if (gtfs_shape_id !== curShapeId || gtfs_shape_index !== curShapeIdx) {
      if (!_.isEmpty(acc && acc.geoms)) {
        const joinMultiLine = turf.multiLineString(
          acc.geoms,
          {
            gtfs_shape_id: curShapeId,
            gtfs_shape_index: curShapeIdx,
            join_metadata: acc.meta,
          },
          { id }
        );

        ++id;

        yield joinMultiLine;
      }

      curShapeId = gtfs_shape_id;
      curShapeIdx = gtfs_shape_index;

      acc = {
        meta: [],
        geoms: [],
      };
    }

    const {
      id: conflation_map_id,
      properties: { networklevel },
    } = feature;

    const len = turf.length(feature);

    if (conf_map_pre_len <= SLICE_THLD && conf_map_post_len <= SLICE_THLD) {
      acc.geoms.push(turf.getCoords(feature));
      acc.meta.push({ conflation_map_id, networklevel, sliced: false });
    } else {
      const startDist = conf_map_pre_len > SLICE_THLD ? conf_map_pre_len : 0;
      const stopDist =
        conf_map_post_len > SLICE_THLD ? len - conf_map_post_len : len;

      console.log(
        JSON.stringify({ feature, len, startDist, stopDist }, null, 4)
      );
      const sliced = turf.lineSliceAlong(feature, startDist, stopDist);
      acc.geoms.push(turf.getCoords(sliced));
      acc.meta.push({ conflation_map_id, networklevel, sliced: true });
    }
  }

  if (!_.isEmpty(acc && acc.geoms)) {
    const joinMultiLine = turf.multiLineString(
      acc.geoms,
      {
        gtfs_shape_id: curShapeId,
        gtfs_shape_index: curShapeIdx,
        join_metadata: acc.meta,
      },
      { id }
    );

    yield joinMultiLine;
  }
}

module.exports = {
  makeGtfsConflationMapJoinIterator,
};
