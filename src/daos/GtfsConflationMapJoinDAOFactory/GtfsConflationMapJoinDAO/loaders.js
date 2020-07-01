/* eslint-disable no-restricted-syntax, jsdoc/require-jsdoc, no-continue, no-underscore-dangle */

const assert = require("assert");

const turf = require("@turf/turf");
const _ = require("lodash");

const db = require("../../../services/DbService");

const {
  GTFS_OSM_NETWORK,
  GTFS_SCHEDULED_TRAFFIC,
  CONFLATION_MAP
} = require("../../../constants/databaseSchemaNames");

const SCHEMA = require("./DATABASE_SCHEMA_NAME");

const {
  createMapSegmentsCospatialityTable,
  createGtfsMatchesConflationMapJoinTable,
  createGtfsCountsConflationMapJoinTable,
  createGtfsRoutesConflationMapJoinTable,
  createConflationMapAadtBreakdownTable
} = require("./createTableFns");

// Assumes:
//   (0) The both features are substrings of the same string.
//
//   (1) If the shst_refs are not acyclic, they self-intersect ONLY at points.
//       (A shst_ref will not overlap itself for any distance.)
//       TODO: Write ASSERTion for this INVARIANT
//
//   (2) If the two features share distance along the shst_ref,
//       and distance before &/∥ after the shared distance is also shared.
//       Derives from (0 & 1).

function getCospatialityOfLinestrings(S, T) {
  // get the coords, removing adjacent equivalent coords
  const sCoords = turf.getCoords(S).reduce((acc, coord, i, coords) => {
    if (!_.isEqual(coord, coords[i - 1])) {
      acc.push(coord);
    }
    return acc;
  }, []);

  // get the coords, removing adjacent equivalent coords
  const tCoords = turf.getCoords(T).reduce((acc, coord, i, coords) => {
    if (!_.isEqual(coord, coords[i - 1])) {
      acc.push(coord);
    }
    return acc;
  }, []);

  if (sCoords.length < 2 || tCoords.length < 2) {
    return null;
  }

  // console.log(JSON.stringify({ S, sCoords }, null, 4));
  const sSegDistsAlong = turf.segmentReduce(
    turf.lineString(sCoords),
    (acc, curSeg) => {
      acc.push(turf.length(curSeg));
      return acc;
    },
    [0]
  );

  const cospatiality = {
    intersectionLength: 0,
    sLen: turf.length(S),
    sPreDist: 0,
    sPostDist: 0,

    tLen: turf.length(T),
    tPreDist: 0,
    tPostDist: 0
  };

  // Use integers for coord comparison rather than Arrays.
  const sCoordStrs = sCoords.map(c => JSON.stringify(c));
  const tCoordStrs = tCoords.map(c => JSON.stringify(c));

  const coordIds = Array.prototype
    .concat(sCoordStrs, tCoordStrs)
    .reduce((acc, c, i) => {
      acc[c] = acc[c] || i;
      return acc;
    }, {});

  // Geom coords to int[]
  const s = sCoordStrs.map(c => coordIds[c]);
  const t = tCoordStrs.map(c => coordIds[c]);

  // Initialize the Dynamic Programming table
  //   of spatial intersection lengths to nulls
  const L = s.map(() => t.map(() => null));

  // The index of the intersection end point for each LineString
  let sEndIdx = null;
  let tEndIdx = null;

  // z is the spatial length of the intersection
  let z = 0;

  // Get the intersection end points for each linestring.
  // O(S.length * T.length)
  for (let i = 0; i < s.length; ++i) {
    const curDistTraveled = sSegDistsAlong[i];
    for (let j = 0; j < t.length; ++j) {
      if (s[i] === t[j]) {
        if (i === 0 || j === 0 || L[i - 1][j - 1] === null) {
          // The intersection is currently a point.
          //   ∴ set length of the intersection to 0
          L[i][j] = 0;
        } else {
          // We are traversing an intersection line
          //   ∴ the intersection length increases by cur seg length
          L[i][j] = L[i - 1][j - 1] + curDistTraveled;
        }

        // new longest?
        if (L[i][j] > z) {
          z = L[i][j];
          sEndIdx = i;
          tEndIdx = j;
        }
      }
    }
  }

  // The index of the intersection start point for each LineString
  let sStartIdx = sEndIdx;
  let tStartIdx = tEndIdx;

  // sEndIdx updates ONLY when there is a sequence of shared coordinates of length > 1.
  //   So if the features share just single coords from the shst_ref, sEndIdx is still null.
  const hadLineIntersection = sEndIdx !== null;

  // If the two features shared shst_ref segments, then we update the intersectionLength
  //   to the length of that shared sequence of segments.
  if (hadLineIntersection) {
    assert(z > 0);

    // Peek if equal, then decrement
    while (
      sStartIdx > 0 && // We can't have equality because both undefined
      sCoordStrs[sStartIdx - 1] === tCoordStrs[tStartIdx - 1]
    ) {
      sStartIdx -= 1;
      tStartIdx -= 1;
    }

    // This geometry is common between S & T, so we can use either to determine its length.
    const intersection = turf.lineString(sCoords.slice(sStartIdx, sEndIdx + 1));

    cospatiality.intersectionLength = turf.length(intersection);

    if (sStartIdx > 0) {
      const sPre = turf.lineString(sCoords.slice(0, sStartIdx + 1));
      cospatiality.sPreDist = turf.length(sPre);
    } else {
      cospatiality.sPreDist = 0;
    }

    if (sEndIdx < sCoords.length - 1) {
      const sPost = turf.lineString(sCoords.slice(sEndIdx));
      cospatiality.sPostDist = turf.length(sPost);
    } else {
      cospatiality.sPostDist = 0;
    }

    if (tStartIdx > 0) {
      const tPre = turf.lineString(tCoords.slice(0, tStartIdx + 1));
      cospatiality.tPreDist = turf.length(tPre);
    } else {
      cospatiality.tPreDist = 0;
    }

    if (tEndIdx < tCoords.length - 1) {
      const tPost = turf.lineString(tCoords.slice(tEndIdx));
      cospatiality.tPostDist = turf.length(tPost);
    } else {
      cospatiality.tPostDist = 0;
    }

    // The internal coordinates of the shst_reference are ASSUMED to be shared.
    //   The start and end coordinates may not be.
    if (cospatiality.sPreDist !== 0 && cospatiality.tPreDist !== 0) {
      const preOverlapDist = Math.min(
        cospatiality.sPreDist,
        cospatiality.tPreDist
      );

      cospatiality.sPreDist -= preOverlapDist;
      cospatiality.tPreDist -= preOverlapDist;
      cospatiality.intersectionLength += preOverlapDist;
    }

    if (cospatiality.sPostDist !== 0 && cospatiality.tPostDist !== 0) {
      const postOverlapDist = Math.min(
        cospatiality.sPostDist,
        cospatiality.tPostDist
      );

      cospatiality.sPostDist -= postOverlapDist;
      cospatiality.tPostDist -= postOverlapDist;
      cospatiality.intersectionLength += postOverlapDist;
    }

    try {
      assert(cospatiality.intersectionLength >= 0);
      assert(cospatiality.sPreDist >= 0);
      assert(cospatiality.sPostDist >= 0);
      assert(cospatiality.tPreDist >= 0);
      assert(cospatiality.tPostDist >= 0);
    } catch (err) {
      console.error("cospatiality INVARIANT broken");
      console.log(
        JSON.stringify(
          {
            sCoords,
            tCoords,
            sStartIdx,
            tStartIdx,
            sEndIdx,
            tEndIdx,
            sLen: turf.length(S),
            tLen: turf.length(T),
            cospatiality
          },
          null,
          4
        )
      );
      process.exit();
    }
  } else {
    // The shared geometry of the shst_ref still might be a point
    //   and subsegments before &/∥ after it.
    //
    // When the features do not share more than one shst_reference coord in sequence,
    //   that does not mean that they do not share that point along with some
    //   shared distance before &/∥ after the point of intersection.
    //
    //      shst_ref : x---x---x
    //      confl    :   y-y-y
    //      gtfs     :  z--z--z
    //      shared   :   *-*-*
    //
    // Therefore need to find all points of intersection using L[][].
    //   Then find where the pre &/or post segments may overlap.
    //   Then we update the intersectionLength and the pre/postDists.

    assert(z === 0);

    for (let i = 0; i < s.length; ++i) {
      for (let j = 0; j < t.length; ++j) {
        // Did we detect an intersection at the respective S & T coords
        if (L[i][j] !== null) {
          assert(L[i][j] === 0);

          // === Check for S&T overlap in ShstRef subsegment preceding intersection point

          // the coord immediately before the intersection
          const _sStartIdx = i > 0 ? i - 1 : null;

          // The segment preceding the intersection point
          const sPreSeg =
            _sStartIdx !== null
              ? turf.lineString(sCoords.slice(_sStartIdx, i + 1))
              : null;

          // the coord immediately before the intersection point
          const _tStartIdx = j > 0 ? j - 1 : null;

          // The segment preceding the intersection
          const tPreSeg =
            _tStartIdx !== null
              ? turf.lineString(tCoords.slice(_tStartIdx, j + 1))
              : null;

          // Do both S & T have segments preceeding the intersection point?
          //   If so, they might have overlapping geometries there.
          if (sPreSeg && tPreSeg) {
            // Get a GeoJSON lineString of where sPreSeg and tPreSeg overlap
            const { features: preOverlaps } = turf.lineOverlap(
              sPreSeg,
              tPreSeg
            );

            if (!_.isEmpty(preOverlaps)) {
              assert(preOverlaps.length === 1);

              const [overlap] = preOverlaps;
              const preOverlapLength = turf.length(overlap);

              if (preOverlapLength) {
                // ASSUMPTION:
                //   There should only be one instance of the Geometries overlapping
                //   around an intersection. z MUST only get updated at the end
                //   of the inner loop iteration.
                assert(z === 0);
                cospatiality.intersectionLength += preOverlapLength;

                const sPre =
                  _sStartIdx !== null &&
                  turf.lineString(sCoords.slice(0, i + 1));

                const sDistAlongTilIntersection = sPre ? turf.length(sPre) : 0;

                // Distance along until the pre-intersection overlap
                cospatiality.sPreDist =
                  sDistAlongTilIntersection - preOverlapLength;

                const tPre =
                  _tStartIdx !== null &&
                  turf.lineString(tCoords.slice(0, j + 1));

                const tDistAlongTilIntersection = tPre ? turf.length(tPre) : 0;

                // Distance along until the pre-intersection overlap
                cospatiality.tPreDist =
                  tDistAlongTilIntersection - preOverlapLength;
              }
            }
          }

          // === Check for S&T overlap in ShstRef subsegment following intersection point

          // the coord immediately after the intersection
          const _sEndIdx = i === s.length - 1 ? null : i + 1;

          // console.log(
          // JSON.stringify(
          // { sCoords, _sEndIdx, i, sliced: sCoords.slice(i, i + 2) },
          // null,
          // 4
          // )
          // );

          // The segment following the intersection point
          const sPostSeg =
            _sEndIdx !== null ? turf.lineString(sCoords.slice(i, i + 2)) : null;

          const _tEndIdx = j === t.length - 1 ? null : j + 1;

          const tPostSeg =
            _tEndIdx !== null ? turf.lineString(tCoords.slice(j, j + 2)) : null;

          if (sPostSeg && tPostSeg) {
            // Get a GeoJSON lineString of wheost sPostSeg and tPostSeg overlap
            const { featuosts: postOverlaps } = turf.lineOverlap(
              sPostSeg,
              tPostSeg
            );

            if (!_.isEmpty(postOverlaps)) {
              assert(postOverlaps.length === 1);

              const [overlap] = postOverlaps;
              const postOverlapLength = turf.length(overlap);

              if (postOverlapLength) {
                // ASSUMPTION:
                //   Theost should only be one instance of the Geometries overlapping
                //   around an intersection. z MUST only get updated at the end
                //   of the inner loop iteration.
                assert(z === 0);
                cospatiality.intersectionLength += postOverlapLength;

                const sPost =
                  _sStartIdx !== null && turf.lineString(sCoords.slice(i));

                const sDistAfterIntersection = sPost ? turf.length(sPost) : 0;

                // Distance along until the post-intersection overlap
                cospatiality.sPostDist =
                  sDistAfterIntersection - postOverlapLength;

                const tPost =
                  _tStartIdx !== null && turf.lineString(tCoords.slice(j));

                const tDistAfterIntersection = tPost ? turf.length(tPost) : 0;

                // Distance along until the post-intersection overlap
                cospatiality.tPostDist =
                  tDistAfterIntersection - postOverlapLength;
              }
            }
          }
        }

        z = Math.max(z, cospatiality.intersectionLength);
      }
    }

    if (cospatiality.intersectionLength === 0) {
      return null;
    }

    const sLen = turf.length(S);
    const tLen = turf.length(T);

    try {
      assert(
        Math.abs(
          cospatiality.sPreDist +
            cospatiality.intersectionLength +
            cospatiality.sPostDist -
            sLen
        ) /
          sLen <
          0.001
      );

      assert(
        Math.abs(
          cospatiality.tPreDist +
            cospatiality.intersectionLength +
            cospatiality.tPostDist -
            tLen
        ) /
          tLen <
          0.001
      );
    } catch (err) {
      console.log(
        "FIXME: cospatiality INVARIANT broken... pre + intersection + post !== len"
      );
      // console.log(err);
      // console.log(
      // JSON.stringify(
      // {
      // cospatiality,
      // sLen,
      // tLen,
      // coordIds,
      // sCoords,
      // tCoords,
      // s,
      // t,
      // L,
      // sStartIdx,
      // sEndIdx,
      // tStartIdx,
      // tEndIdx
      // },
      // null,
      // 4
      // )
      // );

      return null;
    }
  }

  return cospatiality;
}

function loadCospatialityTable() {
  db.attachDatabase(GTFS_OSM_NETWORK);
  db.attachDatabase(CONFLATION_MAP);

  db.exec(`DROP TABLE IF EXISTS ${SCHEMA}.map_segments_cospatiality ;`);

  createMapSegmentsCospatialityTable(db);

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
  const iterQuery = db.prepare(`
    SELECT
        conflation_map.id AS conflation_map_id,
        conflation_map.feature AS conflation_map_feature,

        gtfs_matches.id AS gtfs_matches_id,
        gtfs_matches.feature AS gtfs_matches_feature

      FROM ${GTFS_OSM_NETWORK}.tmp_shst_match_features AS gtfs_matches
        INNER JOIN ${CONFLATION_MAP}.conflation_map USING (shst_reference) ;
  `);

  const iter = iterQuery.raw().iterate();

  for (const [
    conflation_map_id,
    conflation_map_feature,
    gtfs_matches_id,
    gtfs_matches_feature
  ] of iter) {
    const conflationMapFeature = JSON.parse(conflation_map_feature);
    const gtfsMatchesFeature = JSON.parse(gtfs_matches_feature);

    const cospatiality = getCospatialityOfLinestrings(
      conflationMapFeature,
      gtfsMatchesFeature
    );

    // If cospatiality is null, there is no intersection.
    //   shstRef       :   *---------*
    //   conflationMap :   *---*
    //   gtfs map      :         *---*
    if (cospatiality !== null) {
      insertStmt.run([
        conflation_map_id,
        gtfs_matches_id,

        cospatiality.intersectionLength,

        cospatiality.sLen,
        cospatiality.sPreDist,
        cospatiality.sPostDist,

        cospatiality.tLen,
        cospatiality.tPreDist,
        cospatiality.tPostDist
      ]);
    }
  }
}

function loadGtfsMatchesConflationMapJoinTable() {
  db.exec(`DROP TABLE IF EXISTS ${SCHEMA}.gtfs_matches_conflation_map_join ;`);

  createGtfsMatchesConflationMapJoinTable(db);

  db.prepare(
    `
    INSERT INTO ${SCHEMA}.gtfs_matches_conflation_map_join
      SELECT
          conflation_map_id,
          gtfs_matches_id
        FROM (
          SELECT
              conflation_map_id,
              gtfs_matches_id,
              RANK () OVER (
                PARTITION BY conflation_map_id
                ORDER BY
                  intersection_len DESC,
                  gtfs_map_seg_len DESC,
                  gtfs_matches_id
                ) AS intersection_len_rank
              FROM ${SCHEMA}.map_segments_cospatiality 
              ORDER BY conflation_map_id
        ) AS ranked_pairings
        WHERE ( intersection_len_rank = 1 ) ;`
  ).run();
}

function loadGtfsCountsConflationMapJoinTable() {
  db.attachDatabase(GTFS_OSM_NETWORK);
  db.attachDatabase(GTFS_SCHEDULED_TRAFFIC);

  db.exec(`DROP TABLE IF EXISTS ${SCHEMA}.gtfs_counts_conflation_map_join ;`);

  createGtfsCountsConflationMapJoinTable(db);

  db.prepare(
    `
      INSERT INTO ${SCHEMA}.gtfs_counts_conflation_map_join (
          conflation_map_id,
          route_id,
          dow,
          epoch,
          count
        )
        SELECT
            conflation_map_id,
            s.route_id,
            s.dow,
            s.epoch,
            s.count
          FROM ${GTFS_SCHEDULED_TRAFFIC}.shst_matches_schedule_aggregations AS s
            INNER JOIN ${GTFS_OSM_NETWORK}.tmp_shst_match_features AS m
              USING (shst_reference, section_start, section_end)
            INNER JOIN ${SCHEMA}.gtfs_matches_conflation_map_join AS c
              ON (m.id = c.gtfs_matches_id) ; `
  ).run();
}

function loadGtfsRoutesConflationMapJoinTable() {
  db.attachDatabase(GTFS_OSM_NETWORK);
  db.attachDatabase(GTFS_SCHEDULED_TRAFFIC);

  db.exec(`DROP TABLE IF EXISTS ${SCHEMA}.gtfs_routes_conflation_map_join ;`);

  createGtfsRoutesConflationMapJoinTable(db);

  db.prepare(
    `
      INSERT INTO gtfs_routes_conflation_map_join (
          conflation_map_id,
          routes
        )
        SELECT
            conflation_map_id,
            json_group_array( DISTINCT route_id ) routes
          FROM ${GTFS_SCHEDULED_TRAFFIC}.shst_matches_routes AS s
            INNER JOIN ${GTFS_OSM_NETWORK}.tmp_shst_match_features AS m
              USING (shst_reference, section_start, section_end)
            INNER JOIN ${SCHEMA}.gtfs_matches_conflation_map_join AS c
              ON (m.id = c.gtfs_matches_id)
          GROUP BY conflation_map_id ; `
  ).run();
}

function loadConflationMapAadtBreakdownJoinTable() {
  db.exec(`DROP TABLE IF EXISTS ${SCHEMA}.conflation_map_aadt_breakdown ;`);

  createConflationMapAadtBreakdownTable(db);

  // conflation_map_id,
  // route_id,
  // dow,
  // epoch,
  // count

  db.prepare(
    `
      WITH cte_aadt_by_route_by_peak AS (
        SELECT
            conflation_map_id,
            CASE
              WHEN (epoch BETWEEN (6*12) AND (20*12 - 1)) THEN
                CASE
                  WHEN (dow BETWEEN 1 AND 5) THEN
                    CASE
                      WHEN (epoch BETWEEN (6*12) AND (10*12 - 1)) THEN 'AMP'  
                      WHEN (epoch BETWEEN (10*12) AND (16*12 - 1)) THEN 'MIDD'  
                      WHEN (epoch BETWEEN (16*12) AND (20*12 - 1)) THEN 'PMP'  
                    END
                  ELSE 'WE'
                END
              ELSE 'OVN'
            END AS peak,
            route_id,
            SUM(count) / 7.0 AS aadt
          FROM ${SCHEMA}.gtfs_counts_conflation_map_join
          GROUP BY 1,2,3
      )
      INSERT INTO conflation_map_aadt_breakdown (
          conflation_map_id,
          aadt,
          aadt_by_peak,
          aadt_by_route
        )
        SELECT
            conflation_map_id,
            aadt,
            aadt_by_peak,
            aadt_by_route
          FROM (
              SELECT
                  conflation_map_id,
                  SUM(aadt) AS aadt
                FROM cte_aadt_by_route_by_peak
                GROUP BY conflation_map_id
            ) AS sub_aadt
            INNER JOIN (
              SELECT
                  conflation_map_id,
                  json_group_object(
                    peak,
                    aadt
                  ) AS aadt_by_peak
                FROM (
                  SELECT
                      conflation_map_id,
                      peak,
                      SUM(aadt) AS aadt
                    FROM cte_aadt_by_route_by_peak
                    GROUP BY 1,2
                )
                GROUP BY conflation_map_id
            ) USING (conflation_map_id)
            INNER JOIN (
              SELECT
                  conflation_map_id,
                  json_group_object(
                    route_id,
                    JSON(route_aadt_by_peak)
                  ) AS aadt_by_route
                FROM (
                  SELECT
                      conflation_map_id,
                      route_id,
                      json_group_object(
                        peak,
                        aadt
                      ) AS route_aadt_by_peak
                    FROM cte_aadt_by_route_by_peak
                    GROUP BY 1,2
                )
                GROUP BY conflation_map_id
            ) USING (conflation_map_id)

        ;`
  ).run();
}

function load() {
  db.unsafeMode(true);

  try {
    db.exec("BEGIN");

    // loadCospatialityTable();
    // loadGtfsMatchesConflationMapJoinTable();
    // loadGtfsCountsConflationMapJoinTable();
    // loadGtfsRoutesConflationMapJoinTable();
    loadConflationMapAadtBreakdownJoinTable();

    db.exec("COMMIT;");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  } finally {
    db.unsafeMode(false);
  }
}

module.exports = {
  load
};
