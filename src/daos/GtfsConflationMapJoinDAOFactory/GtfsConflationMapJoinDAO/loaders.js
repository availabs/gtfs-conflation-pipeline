/* eslint-disable no-restricted-syntax, jsdoc/require-jsdoc, no-continue, no-underscore-dangle */

/*
    gtfs_osm_network> \d gtfs_shape_shst_match_paths
    +-----+------------------+---------+---------+------------+----+
    | cid | name             | type    | notnull | dflt_value | pk |
    +-----+------------------+---------+---------+------------+----+
    | 0   | gtfs_shape_id    | INTEGER | 1       | <null>     | 1  |
    | 1   | gtfs_shape_index | INTEGER | 1       | <null>     | 2  |
    | 2   | path_index       | INTEGER | 1       | <null>     | 3  |
    | 3   | path_edge_index  | INTEGER | 1       | <null>     | 4  |
    | 4   | shst_match_id    | INTEGER | 0       | <null>     | 0  |
    | 5   | shst_reference   | TEXT    | 0       | <null>     | 0  |
    | 6   | shst_ref_start   | REAL    | 0       | <null>     | 0  |
    | 7   | shst_ref_end     | REAL    | 0       | <null>     | 0  |
    +-----+------------------+---------+---------+------------+----+

    conflation_map.patched> \d conflation_map

    +-----+---------+---------+---------+------------+----+
    | cid | name    | type    | notnull | dflt_value | pk |
    +-----+---------+---------+---------+------------+----+
    | 0   | id      | INTEGER | 1       | <null>     | 1  |
    | 1   | feature | TEXT    | 1       | <null>     | 0  |
    +-----+---------+---------+---------+------------+----+

    conflation_map.feature.properties includes

      * startDist
      * endDist
      * shstReferenceId

    shstRef  s...........................e
    match    |             s....e        |
             |             |    |        |
             |<---POFF---->|    |<-NOFF->|
             |<-startDist->|    |
             |<-----endDist---->|
*/

// npmrds-osm-conflation/src/services/shstTilesetSQLiteService/selectShStReferenceFromCandidates.js
//   Chooses the geometry with the most coordinates.
//   Hopefully that means the one with the longest length as well.
//     TODO: Confirm we aren't using a truncated geometry for a Shst Reference

const _ = require("lodash");
const db = require("../../../services/DbService");

const {
  GTFS_OSM_NETWORK,
  CONFLATION_MAP,
} = require("../../../constants/databaseSchemaNames");

const SCHEMA = require("./DATABASE_SCHEMA_NAME");

const INTXN_LEN_THOLD = 0.001; // 1m

const {
  createMapSegmentsCospatialityTable,
  createGtfsMatchesConflationMapJoinTable,
} = require("./createTableFns");

const getCospatialityOfLinestrings = require("../../../utils/gis/getCospatialityOfLinestrings");

function loadCospatialityTable() {
  db.exec(`DROP TABLE IF EXISTS ${SCHEMA}.map_segments_cospatiality ;`);

  createMapSegmentsCospatialityTable(db);

  /*
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.map_segments_cospatiality(
      conflation_map_id  INTEGER,
      gtfs_matches_id    INTEGER,

      intersection_len   REAL,

      conf_map_seg_len   REAL,
      conf_map_pre_len   REAL,
      conf_map_post_len  REAL,

      gtfs_map_seg_len   REAL,
      gtfs_map_pre_len   REAL,
      gtfs_map_post_len  REAL,

      PRIMARY KEY(conflation_map_id, gtfs_matches_id)
    ) WITHOUT ROWID ;
  */

  const insertStmt = db.prepare(`
    INSERT INTO ${SCHEMA}.map_segments_cospatiality (
        conflation_map_id,
        gtfs_matches_id,

        intersection_len,

        conf_map_seg_len,
        conf_map_pre_len,
        conf_map_post_len,

        gtfs_map_seg_len,
        gtfs_map_pre_len,
        gtfs_map_post_len
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ;`);

  // Iterate over all conflation_map/gtfs_matches pairs that share a shst_reference

  // TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO
  // use shst_ref_start/end to check cospatiality

  /*
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
  */
  const iterQuery = db.prepare(`
    SELECT
        conflation_map.id AS conflation_map_id,
        conflation_map.feature AS conflation_map_feature,

        gtfs_matches.id AS gtfs_matches_id,
        gtfs_matches.feature AS gtfs_matches_feature,

        gtfs_match_paths.shst_ref_start,
        gtfs_match_paths.shst_ref_end

      FROM ${GTFS_OSM_NETWORK}.gtfs_shape_shst_match_paths AS gtfs_match_paths
        INNER JOIN ${GTFS_OSM_NETWORK}.tmp_shst_match_features AS gtfs_matches
          ON (gtfs_match_paths.shst_match_id = gtfs_matches.id)
        INNER JOIN ${CONFLATION_MAP}.conflation_map
          USING (shst_reference) ;
  `);

  const iter = iterQuery.raw().iterate();

  for (const [
    conflation_map_id,
    conflation_map_feature,
    gtfs_matches_id,
    gtfs_matches_feature,
    // shst_ref_start,
    // shst_ref_end,
  ] of iter) {
    const conflationMapFeature = JSON.parse(conflation_map_feature);
    const gtfsMatchesFeature = JSON.parse(gtfs_matches_feature);

    conflationMapFeature.id = conflation_map_id;
    gtfsMatchesFeature.id = gtfs_matches_id;

    /*
        [
            {
                "sLen": 0.043560837704171705,
                "sIntxnOffsets": {
                    "startAlong": 0.029786694244378055,
                    "startFromEnd": 0.01377414345979365,
                    "endAlong": 0.043560837704171705,
                    "endFromEnd": 0
                },
                "tLen": 0.014818319938354368,
                "tIntxnOffsets": {
                    "startAlong": 0.0010339614276167418,
                    "startFromEnd": 0.013784358510737626,
                    "endAlong": 0.014818319938354368,
                    "endFromEnd": 0
                }
            }
        ]
    */

    let cospatiality = getCospatialityOfLinestrings(
      conflationMapFeature,
      gtfsMatchesFeature
    );

    // If cospatiality is null, there is no intersection.
    if (cospatiality !== null) {
      if (cospatiality.length > 1) {
        // TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO
        //   Think this through more carefully.
        //   Some geometries may invalidate the inherent assumptions.
        const { sLen, tLen } = _.first(cospatiality);
        cospatiality = {
          sLen,
          sIntxnOffsets: {
            startAlong: _(cospatiality).map("sIntxnOffsets.startAlong").min(),
            endFromEnd: _(cospatiality).map("sIntxnOffsets.endFromEnd").min(),
          },
          tLen,
          tIntxnOffsets: {
            startAlong: _(cospatiality).map("tIntxnOffsets.startAlong").min(),
            endFromEnd: _(cospatiality).map("tIntxnOffsets.endFromEnd").min(),
          },
        };
      }

      for (
        let overlap_idx = 0;
        overlap_idx < cospatiality.length;
        ++overlap_idx
      ) {
        const overlap = cospatiality[overlap_idx];

        const {
          sLen,
          sIntxnOffsets: { startAlong: sPreDist, endFromEnd: sPostDist },
          tLen,
          tIntxnOffsets: { startAlong: tPreDist, endFromEnd: tPostDist },
        } = overlap;

        const sIntxnLen = sLen - sPreDist - sPostDist;
        const tIntxnLen = tLen - tPreDist - tPostDist;

        const intxnLen = Math.min(sIntxnLen, tIntxnLen);

        if (intxnLen > INTXN_LEN_THOLD) {
          /*
            INSERT INTO ${SCHEMA}.map_segments_cospatiality (
                conflation_map_id,
                gtfs_matches_id,

                intersection_len,

                conf_map_seg_len,
                conf_map_pre_len,
                conf_map_post_len,

                gtfs_map_seg_len,
                gtfs_map_pre_len,
                gtfs_map_post_len
              )
          */

          insertStmt.run([
            conflation_map_id,
            gtfs_matches_id,

            intxnLen,

            sLen,
            sPreDist,
            sPostDist,

            tLen,
            tPreDist,
            tPostDist,
          ]);
        }
      }
    }
  }
}

function loadGtfsMatchesConflationMapJoinTable() {
  db.exec(`DROP TABLE IF EXISTS ${SCHEMA}.gtfs_matches_conflation_map_join ;`);

  createGtfsMatchesConflationMapJoinTable(db);

  /*
    CREATE TABLE IF NOT EXISTS gtfs_osm_network.gtfs_shape_shst_match_paths (
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

    CREATE TABLE IF NOT EXISTS gtfs_conflation_map_join.map_segments_cospatiality(
      conflation_map_id  INTEGER,
      gtfs_matches_id    INTEGER,

      overlap_idx        INTEGER,

      intersection_len   REAL,

      conf_map_seg_len   REAL,
      conf_map_pre_len   REAL,
      conf_map_post_len  REAL,

      gtfs_map_seg_len   REAL,
      gtfs_map_pre_len   REAL,
      gtfs_map_post_len  REAL,

      PRIMARY KEY(conflation_map_id, gtfs_matches_id)
    ) WITHOUT ROWID ;
  */

  db.prepare(
    `
    INSERT INTO ${SCHEMA}.gtfs_matches_conflation_map_join (
      gtfs_shape_id,
      gtfs_shape_index,
      conflation_map_id,
      conf_map_pre_len,
      conf_map_post_len,
      along_idx
    )
      SELECT
          gtfs_shape_id,
          gtfs_shape_index,

          conflation_map_id,
          conf_map_pre_len,
          conf_map_post_len,

          along_rank - 1
        FROM (
          SELECT
              gtfs_shape_id,
              gtfs_shape_index,

              conflation_map_id,
              conf_map_pre_len,
              conf_map_post_len,

              RANK () OVER (
                PARTITION BY
                  gtfs_shape_id,
                  gtfs_shape_index
                ORDER BY
                  path_index,
                  path_edge_index,

                  gtfs_map_pre_len
              ) AS along_rank
              FROM ${GTFS_OSM_NETWORK}.gtfs_shape_shst_match_paths AS a
                INNER JOIN ${SCHEMA}.map_segments_cospatiality AS b
                  ON (a.shst_match_id = b.gtfs_matches_id)
              ORDER BY gtfs_shape_id, gtfs_shape_index
        ) AS toposorted_conflation_map_segments ; `
  ).run();
}

function load() {
  db.unsafeMode(true);

  try {
    db.attachDatabase(GTFS_OSM_NETWORK);
    db.attachDatabase(CONFLATION_MAP);

    db.exec("BEGIN");

    loadCospatialityTable();
    loadGtfsMatchesConflationMapJoinTable();

    db.exec("COMMIT;");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  } finally {
    db.unsafeMode(false);
  }
}

module.exports = {
  load,
};
