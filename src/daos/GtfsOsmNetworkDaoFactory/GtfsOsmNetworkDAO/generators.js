/* eslint-disable no-restricted-syntax, jsdoc/require-jsdoc */

const db = require("../../../services/DbService");

const {
  GTFS_NETWORK,
  GTFS_OSM_NETWORK
} = require("../../../constants/databaseSchemaNames");

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
  db.attachDatabase(GTFS_NETWORK);

  const iterQuery = db.prepare(`
      SELECT
          network_edges.feature AS gtfs_network_edge,
          (
            '[' ||
            group_concat( DISTINCT matches.match_feature ) ||
            ']'
          ) AS shst_matches
        FROM ${GTFS_NETWORK}.shape_segments AS network_edges
          INNER JOIN ${GTFS_OSM_NETWORK}.tmp_raw_shst_matches AS matches USING (shape_id)
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

module.exports = {
  makeMatchesIterator
};
