const {
  RAW_GTFS,
  GTFS_SCHEDULED_TRAFFIC,
} = require("../../../constants/databaseSchemaNames");
const SCHEMA = require("./DATABASE_SCHEMA_NAME");

const createGtfsSyntheticProbeDataTable = (db) =>
  // NOTE: Will need to sum travel times for (conflation_map_id, trip_id, epoch)
  db.exec(`
    DROP TABLE IF EXISTS ${SCHEMA}.gtfs_synthetic_probe_data ;

    CREATE TABLE IF NOT EXISTS ${SCHEMA}.gtfs_synthetic_probe_data(
      conflation_map_id  INTEGER,
      trip_id            TEXT,
      epoch              INTEGER,
      travel_time        REAL,

      PRIMARY KEY (conflation_map_id, trip_id, epoch)
    ) WITHOUT ROWID;
  `);

const createGtfsAggregations = (db) => {
  db.attachDatabase(RAW_GTFS);
  db.attachDatabase(GTFS_SCHEDULED_TRAFFIC);

  db.exec(`
    DROP TABLE IF EXISTS ${SCHEMA}.gtfs_scheduled_traffic_by_route ;

    CREATE TABLE ${SCHEMA}.gtfs_scheduled_traffic_by_route
      AS
        WITH cte_feed_date_extent_num_weeks AS (
          SELECT
              (
                (
                  julianday(
                    substr(feed_end_date, 1, 4)
                    || '-'
                    || substr(feed_end_date, 5, 2)
                    || '-'
                    || substr(feed_end_date, 7, 2)
                  )
                  -
                  julianday(
                    substr(feed_start_date, 1, 4)
                    || '-'
                    || substr(feed_start_date, 5, 2)
                    || '-'
                    || substr(feed_start_date, 7, 2)
                  )
                ) / 7.0
              ) AS feed_num_weeks
          FROM ${GTFS_SCHEDULED_TRAFFIC}.feed_date_extent
        )
        SELECT
            conflation_map_id,
            route_short_name,
            dow,
            epoch,

            AVG(travel_time) AS avg_travel_time,

            -- Count for DOW divided by number of scheduled weeks for route
            ROUND(
              COUNT(1) / MAX(feed_num_weeks),
              1
            ) AS avg_weekly_count,
            group_concat(DISTINCT trip_id) AS trip_ids
          FROM ${RAW_GTFS}.routes
            INNER JOIN ${RAW_GTFS}.trips
              USING (route_id)
            INNER JOIN ${GTFS_SCHEDULED_TRAFFIC}.service_dates
              USING (service_id)
            INNER JOIN ${SCHEMA}.gtfs_synthetic_probe_data
              USING (trip_id)
            CROSS JOIN cte_feed_date_extent_num_weeks
          GROUP BY
            conflation_map_id,
            route_short_name,
            dow,
            epoch ;
  `);

  db.exec(`
    DROP TABLE IF EXISTS ${SCHEMA}.gtfs_scheduled_traffic ;

    CREATE TABLE ${SCHEMA}.gtfs_scheduled_traffic
      AS
        SELECT
            conflation_map_id,
            dow,
            epoch,

            ROUND(
              SUM(avg_travel_time * avg_weekly_count)
              /
              SUM(avg_weekly_count),
              3
            ) AS avg_tt,

            SUM(avg_weekly_count) AS avg_weekly_count,

            group_concat(DISTINCT route_short_name) AS routes
          FROM ${SCHEMA}.gtfs_scheduled_traffic_by_route
          GROUP BY
            conflation_map_id,
            dow,
            epoch ;
  `);
};

const createConflationMapAadtBreakdownTable = (db) =>
  db.exec(`
    DROP TABLE IF EXISTS ${SCHEMA}.conflation_map_aadt_breakdown ;

    CREATE TABLE IF NOT EXISTS ${SCHEMA}.conflation_map_aadt_breakdown(
      conflation_map_id  INTEGER,
      aadt               INTEGER,
      aadt_by_peak       TEXT, -- JSON
      aadt_by_route      TEXT, -- JSON

      PRIMARY KEY(conflation_map_id)
    ) WITHOUT ROWID ;

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
          route_short_name,
          ROUND(
            SUM(avg_weekly_count)
            / 7
          ) AS aadt
        FROM ${SCHEMA}.gtfs_scheduled_traffic_by_route
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
                  route_short_name,
                  JSON(route_aadt_by_peak)
                ) AS aadt_by_route
              FROM (
                SELECT
                    conflation_map_id,
                    route_short_name,
                    json_group_object(
                      peak,
                      aadt
                    ) AS route_aadt_by_peak
                  FROM cte_aadt_by_route_by_peak
                  GROUP BY 1,2
              )
              GROUP BY conflation_map_id
          ) USING (conflation_map_id)

    ;
  `);

module.exports = {
  createGtfsSyntheticProbeDataTable,
  createGtfsAggregations,
  createConflationMapAadtBreakdownTable,
};
