/* eslint-disable no-restricted-syntax, jsdoc/require-jsdoc, no-param-reassign */

const _ = require("lodash");
const db = require("../../services/DbService");

const {
  GTFS_NETWORK,
  GTFS_OSM_NETWORK,
} = require("../../constants/databaseSchemaNames");

// CREATE TABLE IF NOT EXISTS ${SCHEMA}.shape_segments (
//   shape_id       TEXT,
//   shape_index    INTEGER,
//   from_stop_ids  TEXT,
//   to_stop_ids    TEXT,
//   geoprox_key    TEXT,
//   feature        TEXT,
//
//   PRIMARY KEY (shape_id, shape_index)
// ) WITHOUT ROWID ;
//
// CREATE TABLE IF NOT EXISTS ${SCHEMA}.tmp_raw_shst_matches (
//   shape_id       TEXT,
//   shape_index    INTEGER,
//   osrm_dir       TEXT,
//   match_feature  TEXT
// ) ;
//
function* makeMatchesIterator() {
  const iterQuery = db.prepare(`
      SELECT
          network_edges.feature AS gtfs_network_edge,
          (
            '[' ||
            group_concat(
              json_set(
                matches.feature,
                '$.id',
                matches.id
              )
            ) ||
            ']'
          ) AS shst_matches
        FROM ${GTFS_NETWORK}.shape_segments AS network_edges
          INNER JOIN ${GTFS_OSM_NETWORK}.tmp_raw_shst_matches AS matches USING (shape_id, shape_index)
        GROUP BY network_edges.feature
        ORDER BY network_edges.geoprox_key
      ;
  `);

  const iter = iterQuery.raw().iterate();

  for (const [gtfs_network_edge, shst_matches] of iter) {
    const gtfsNetworkEdge = JSON.parse(gtfs_network_edge);
    const shstMatches = JSON.parse(shst_matches);

    yield { gtfsNetworkEdge, shstMatches };
  }
}

// Allow loader to pass the transaction database instance, xdb.
//   This is because the load of tmp_shst_match_features
//     has not yet been committed, so db will not see it.
function* makeShapeMatchesIterator() {
  const iterQuery = db.prepare(`
      SELECT
          -- An array of (GTFS Shape Segs, ShstMatches), for each GTFS Shape.
          (
            '[' ||
            group_concat(
              json_object(
                'gtfsNetworkEdge',
                json(gtfs_network_edge),

                'shstMatches',
                json(shst_matches)
              )
            ) ||
            ']'
          ) AS unordered_segments_matches
        FROM (  
          SELECT
              network_edges.feature AS gtfs_network_edge,
              -- For each GTFS Shape Segment, an array of all the ShstMatches
              (
                '[' ||
                group_concat(
                  -- Set the DB generated ID as the feature ID.
                  json_set(
                    matches.feature,
                    '$.id',
                    matches.id
                  )
                ) ||
                ']'
              ) AS shst_matches
            FROM ${GTFS_NETWORK}.shape_segments AS network_edges
              LEFT OUTER JOIN ${GTFS_OSM_NETWORK}.tmp_shst_match_features
                AS matches USING (shape_id, shape_index)
            GROUP BY network_edges.feature
            ORDER BY network_edges.geoprox_key
        ) AS sub_matches_per_segment
        GROUP BY json_extract(gtfs_network_edge, '$.properties.shape_id')
      ;
  `);

  const iter = iterQuery.raw().iterate();

  for (const unordered_segments_matches of iter) {
    const gtfsShapeShstMatches = JSON.parse(unordered_segments_matches);

    gtfsShapeShstMatches.sort(
      (a, b) =>
        _.get(a, ["gtfsNetworkEdge", "properties", "shape_index"], 0) -
        _.get(b, ["gtfsNetworkEdge", "properties", "shape_index"], 0)
    );

    yield gtfsShapeShstMatches;
  }
}

function* makeAllShstMatchesIterator() {
  const iter = makeShapeMatchesIterator();

  for (const shapeShstMatches of iter) {
    for (let i = 0; i < shapeShstMatches.length; ++i) {
      const { shstMatches } = shapeShstMatches[i];

      if (!_.isEmpty(shstMatches)) {
        for (let j = 0; j < shstMatches.length; ++j) {
          yield shstMatches[j];
        }
      }
    }
  }
}

/*
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.gtfs_shape_shst_match_paths (
      gtfs_shape_id     INTEGER,
      gtfs_shape_index  INTEGER,
      path_index        INTEGER,
      path_edge_index   INTEGER,
      shst_match_id     INTEGER,
      shst_reference    TEXT,
      shst_ref_start    REAL,
      shst_ref_end      REAL,
      
      PRIMARY KEY (gtfs_shape_id, gtfs_shape_index, path_index, path_edge_index)
    ) WITHOUT ROWID;

      CREATE TABLE IF NOT EXISTS ${SCHEMA}.tmp_shst_match_features (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        shape_id        TEXT,
        shape_index     INTEGER,
        shst_reference  TEXT,
        section_start   REAL,
        section_end     REAL,
        osrm_dir        TEXT,
        feature_len_km  REAL,
        feature         TEXT,
        
        UNIQUE (shape_id, shape_index, shst_reference, section_start, section_end)
      ) ;
*/
function* makeAllChosenShstMatchesIterator() {
  const iterQuery = db.prepare(`
      SELECT DISTINCT
          feature
        FROM ${GTFS_OSM_NETWORK}.gtfs_shape_shst_match_paths AS a
          INNER JOIN ${GTFS_OSM_NETWORK}.tmp_shst_match_features AS b
          ON ( a.shst_match_id = b.id ) ;
  `);

  const iter = iterQuery.raw().iterate();

  for (const [featureStr] of iter) {
    const shstMatch = JSON.parse(featureStr);

    yield shstMatch;
  }
}

module.exports = {
  makeMatchesIterator,
  makeShapeMatchesIterator,
  makeAllShstMatchesIterator,
  makeAllChosenShstMatchesIterator,
};
