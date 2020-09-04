/* eslint-disable no-restricted-syntax, jsdoc/require-jsdoc, no-continue, no-underscore-dangle */

/*
https://github.com/availabs/npmrds-osm-conflation/blob/6ed6d7bd50d3ea58860489ce60b9c825aac9cd26/src/conflation/constants.js
https://github.com/sharedstreets/sharedstreets-types/blob/3c1d5822ff4943ae063f920e018dd3e349213c8c/index.ts#L33-L44

  const shstOsmWayRoadClassRankings = {
    Motorway: 0,
    Trunk: 1,
    Primary: 2,
    Secondary: 3,
    Tertiary: 4,
    Residential: 5,
    Unclassified: 6,
    Service: 7,
    Other: 8
  };

The OSM targetMapNetHrchyRank is the conflation map networklev.

https://github.com/availabs/npmrds-osm-conflation/blob/6ed6d7bd50d3ea58860489ce60b9c825aac9cd26/src/conflation/getShstMatchedSegmentOffsetsByTargetMap/getOffsetsAlongShstRefForUnderlyingOsmWays.js#L44-L48
https://github.com/availabs/npmrds-osm-conflation/blob/52205a23bdb5dd6240649ce7178c94d47dda5c31/src/conflation/run#L71-L75

Speedlimits by networklev

npmrds_production=# select floor(networklev), avg(posted_speed_limit) from conflation.conflation_map_v0_4_2 inner join ris.road_inventory_system_2018 on (ris19id = ogc_fid) where posted_speed_limit > 0 group by 1 order by 1;

   floor |         avg
  -------+---------------------
       0 | 57.5293543639621193
       1 | 44.9046488198042602
       2 | 41.6245565288373991
       3 | 41.6612609086669775
       4 | 39.5276998658058274
       5 | 33.5162917943089298
       6 | 40.7686941964285714
       7 | 31.8653516295025729
  (8 rows)
*/

const _ = require("lodash");
const db = require("../../services/DbService");

const {
  GTFS_SCHEDULED_TRAFFIC,
  CONFLATION_MAP,
  GTFS_CONFLATION_MAP_JOIN,
} = require("../../constants/databaseSchemaNames");

const SCHEMA = require("./DATABASE_SCHEMA_NAME");

const {
  createGtfsSyntheticProbeDataTable,
  createGtfsAggregations,
  createConflationMapAadtBreakdownTable,
} = require("./createTableFns");

const networklevelAvgPostedSpeedlimt = {
  0: 57.5,
  1: 44.9,
  2: 41.6,
  3: 41.7,
  4: 39.5,
  5: 33.5,
  6: 40.8,
  7: 31.9,
};

const sec2epoch = (sec) => Math.floor(sec / 60 / 5);

/*
  gtfs_scheduled_traffic> \d scheduled_transit_traffic
  +-----+--------------------+---------+---------+------------+----+
  | cid | name               | type    | notnull | dflt_value | pk |
  +-----+--------------------+---------+---------+------------+----+
  | 0   | shape_id           | TEXT    | 1       | <null>     | 1  |
  | 1   | departure_seg_idx  | INTEGER | 1       | <null>     | 2  |
  | 2   | arrival_seg_idx    | INTEGER | 1       | <null>     | 3  |
  | 3   | departure_time_sec | INTEGER | 1       | <null>     | 4  |
  | 4   | arrival_time_sec   | INTEGER | 1       | <null>     | 5  |
  | 5   | trip_id            | TEXT    | 1       | <null>     | 6  |
  +-----+--------------------+---------+---------+------------+----+

  gtfs_scheduled_traffic> \d service_dates
  +-----+------------+---------+---------+------------+----+
  | cid | name       | type    | notnull | dflt_value | pk |
  +-----+------------+---------+---------+------------+----+
  | 0   | service_id | TEXT    | 1       | <null>     | 1  |
  | 1   | date       | TEXT    | 1       | <null>     | 2  |
  | 2   | dow        | INTEGER | 1       | <null>     | 0  |
  +-----+------------+---------+---------+------------+----+

  gtfs_conflation_map_join> \d gtfs_matches_conflation_map_join
  +-----+-------------------+---------+---------+------------+----+
  | cid | name              | type    | notnull | dflt_value | pk |
  +-----+-------------------+---------+---------+------------+----+
  | 0   | id                | INTEGER | 0       | <null>     | 1  |
  | 1   | gtfs_shape_id     | INTEGER | 0       | <null>     | 0  |
  | 2   | gtfs_shape_index  | INTEGER | 0       | <null>     | 0  |
  | 3   | conflation_map_id | INTEGER | 0       | <null>     | 0  |
  | 4   | conf_map_pre_len  | REAL    | 0       | <null>     | 0  |
  | 5   | conf_map_post_len | REAL    | 0       | <null>     | 0  |
  | 6   | along_idx         | INTEGER | 0       | <null>     | 0  |
  +-----+-------------------+---------+---------+------------+----+

  conflation_map> \d conflation_map
  +-----+----------------+---------+---------+------------+----+
  | cid | name           | type    | notnull | dflt_value | pk |
  +-----+----------------+---------+---------+------------+----+
  | 0   | id             | INTEGER | 1       | <null>     | 1  |
  | 1   | shst_reference | TEXT    | 1       | <null>     | 0  |
  | 2   | networklevel   | INTEGER | 1       | <null>     | 0  |
  | 3   | length_km      | REAL    | 0       | <null>     | 0  |
  | 4   | feature        | TEXT    | 1       | <null>     | 0  |
  +-----+----------------+---------+---------+------------+----+

  CREATE TABLE IF NOT EXISTS ${SCHEMA}.gtfs_synthetic_probe_data(
    conflation_map_id  INTEGER,
    trip_id            TEXT,
    epoch              INTEGER,
    travel_time        REAL,

    PRIMARY KEY(conflation_map_id, trip_id, epoch)
  ) WITHOUT ROWID ;
*/

function loadGtfsSyntheticProbeDataTable() {
  db.exec(`DROP TABLE IF EXISTS ${SCHEMA}.gtfs_synthetic_probe_data ;`);

  createGtfsSyntheticProbeDataTable(db);

  db.exec(`
    CREATE TEMPORARY TABLE tmp_gtfs_synthetic_probe_data
      AS
        SELECT
            *
          FROM ${SCHEMA}.gtfs_synthetic_probe_data
          WHERE false
    ;
  `);

  const insertStmt = db.prepare(`
    INSERT INTO tmp_gtfs_synthetic_probe_data (
      conflation_map_id,
      trip_id,
      epoch,
      travel_time
    ) VALUES (?, ?, ?, ?) ;
  `);

  const iterQuery = db.prepare(`
    SELECT
        trip_id,

        departure_time_sec,
        arrival_time_sec,

        -- The sequence of conflation map segments traversed
        --   between the departure stop and the arrival stop
        (
          '[' ||
            group_concat(
              json_object(
                'conflation_map_id',
                conflation_map_id,

                'networklevel',
                networklevel,

                'length_km',
                length_km,

                'conf_map_pre_len',
                conf_map_pre_len,

                'conf_map_post_len',
                conf_map_post_len,

                'along_idx',
                along_idx
              )
            ) ||
          ']'
        ) AS confl_map_path

      FROM ${GTFS_SCHEDULED_TRAFFIC}.scheduled_transit_traffic AS a
        INNER JOIN ${GTFS_CONFLATION_MAP_JOIN}.gtfs_matches_conflation_map_join AS b
          ON ( a.shape_id = b.gtfs_shape_id )
        INNER JOIN ${CONFLATION_MAP}.conflation_map AS a
          ON ( b.conflation_map_id = a.id )
      WHERE (
        ( a.departure_seg_idx <= b.gtfs_shape_index )
        AND
        ( a.arrival_seg_idx > b.gtfs_shape_index )
      )
      GROUP BY
        trip_id,
        departure_time_sec,
        arrival_time_sec,
        -- These are included because GTFS has unreliable logic
        --   Better to be safe than to assume.
        departure_seg_idx,
        arrival_seg_idx
      ORDER BY
        trip_id,
        departure_time_sec
    ;
  `);

  const iter = iterQuery.raw().iterate();

  for (const [
    trip_id,
    departure_time_sec,
    arrival_time_sec,
    confl_map_path,
  ] of iter) {
    const conflationMapPath = _(JSON.parse(confl_map_path))
      .sortBy("along_idx")
      .value();

    const conflMapPathWeights = conflationMapPath.map(
      ({ networklevel, length_km, conf_map_pre_len, conf_map_post_len }) => {
        const speedlimit =
          networklevelAvgPostedSpeedlimt[Math.floor(networklevel)] || 30;

        const len = length_km - conf_map_pre_len - conf_map_post_len;

        return len / speedlimit; // Note: Units mismatch, but just looking for c scalar
      }
    );

    const totalWeight = _.sum(conflMapPathWeights);

    const normalizedConfPathWeights = conflMapPathWeights.map(
      (w) => w / totalWeight
    );

    const ttSecs = arrival_time_sec - departure_time_sec;

    const distributedTravelTimes = normalizedConfPathWeights.map(
      (w) => ttSecs * w
    );

    const conflMapSegDeptTimes = distributedTravelTimes.slice(0, -1).reduce(
      (acc, tt) => {
        const prevDept = _.last(acc);
        acc.push(prevDept + tt);
        return acc;
      },
      [departure_time_sec]
    );

    const conflMapSegDeptEpochs = conflMapSegDeptTimes.map(sec2epoch);

    for (let i = 0; i < conflationMapPath.length; ++i) {
      const { conflation_map_id } = conflationMapPath[i];
      const epoch = conflMapSegDeptEpochs[i];
      const travel_time = _.round(distributedTravelTimes[i], 3);

      insertStmt.run([conflation_map_id, trip_id, epoch, travel_time]);
    }
  }

  db.exec(`
    INSERT INTO ${SCHEMA}.gtfs_synthetic_probe_data
      SELECT
          conflation_map_id,
          trip_id,
          epoch,
          -- For the conflation map segment containing a stop we sum
          --   * the travel time (tt) from the conflation map segment start to the stop
          --   * the time standing at the stop, artificially increasing tt.
          --   * the travel time from the stop to the conflation map segment end
          --     NOTE: for the destination stop, this time is missing, artificially decreasing tt.
          SUM(travel_time) AS travel_time
        FROM tmp_gtfs_synthetic_probe_data
        GROUP BY
          conflation_map_id,
          trip_id,
          epoch
        ORDER BY conflation_map_id, trip_id, epoch ;

    DROP TABLE tmp_gtfs_synthetic_probe_data;
  `);
}

function load() {
  db.unsafeMode(true);

  try {
    db.exec("BEGIN");

    loadGtfsSyntheticProbeDataTable(db);
    createGtfsAggregations(db);
    createConflationMapAadtBreakdownTable(db);

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
