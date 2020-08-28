/*

  Schedule-Based Modeling of Transportation Networks: Theory and Applications.
    (2008). Netherlands: Springer US.


  feed_info.txt
    File: Conditionally required

      feed_start_date

        The dataset provides complete and reliable schedule information for
        service in the period from the beginning of the feed_start_date day to
        the end of the feed_end_date day.

        Both days can be left empty if unavailable.

        The feed_end_date date must not precede the feed_start_date date if
        both are given.

        Dataset providers are encouraged to give schedule data outside this
        period to advise of likely future service, but dataset consumers should
        treat it mindful of its non-authoritative status.

        If feed_start_date or feed_end_date extend beyond the active calendar
        dates defined in calendar.txt and calendar_dates.txt, the dataset is
        making an explicit assertion that there is no service for dates within
        the feed_start_date to feed_end_date range but not included in the
        active calendar dates.

      feed_end_date

  calendar.txt
    File: Conditionally required

      service_id  (Required)
      monday      (Required)
      tuesday     (Required)
      wednesday   (Required)
      thursday    (Required)
      friday      (Required)
      saturday    (Required)
      sunday      (Required)
      start_date  (Required)
      end_date    (Required)

  calendar_dates.txt
    File: Conditionally required

    The calendar_dates.txt table can explicitly activate or disable service by date.
    It can be used in two ways.

      *  Recommended: Use calendar_dates.txt in conjunction with calendar.txt to define

         is generally regular, with a few changes on explicit dates (for instance, to
         accommodate special event services, or a school schedule), this is a good
         approach. In this case calendar_dates.service_id is an ID referencing
         calendar.service_id.

      *  Alternate: Omit calendar.txt, and specify each date of
         service in calendar_dates.txt. This allows for considerable service variation
         and accommodates service without normal weekly schedules. In this case
         service_id is an ID.

      calendar_dates.exception_type	(Required)

          Indicates whether service is available on the date specified in the date field.
          Valid options are:

            1 - Service has been added for the specified date.
            2 - Service has been removed for the specified date.

*/

/*
    1. If no calendar table, create a temporary view.
    2. If no calendar_dates table, create
*/

const { RAW_GTFS } = require("../../../constants/databaseSchemaNames");
const SCHEMA = require("./DATABASE_SCHEMA_NAME");

const createScheduledTransitTrafficTable = (db) =>
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.scheduled_transit_traffic (
        shape_id            TEXT,
        departure_seg_idx   INTEGER,
        arrival_seg_idx     INTEGER,

        departure_time_sec  INTEGER,
        arrival_time_sec    INTEGER,

        trip_id             TEXT,

      PRIMARY KEY (
        shape_id,
        departure_seg_idx,
        arrival_seg_idx,
        departure_time_sec,
        arrival_time_sec,
        trip_id
      )
    ) WITHOUT ROWID ;
  `);

// TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO
// Handle case of GTFS with no calendar table
const createServiceDatesTable = (db) => {
  db.attachDatabase(RAW_GTFS);

  const { has_calendar_table, has_calendar_dates_table } = db
    .prepare(
      `
        SELECT
            EXISTS (
              SELECT
                  1
                FROM ${RAW_GTFS}.sqlite_master
                WHERE (
                  ( type = 'table' )
                  AND
                  ( name = 'calendar' )
                )
            ) AS has_calendar_table,
            EXISTS (
              SELECT
                  1
                FROM ${RAW_GTFS}.sqlite_master
                WHERE (
                  ( type = 'table' )
                  AND
                  ( name = 'calendar_dates' )
                )
            ) AS has_calendar_dates_table ;`
    )
    .get();

  // Because the calendar and calendar_dates tables are optional,
  //   we create views so that the CREATE service_dates table
  //   is uniform across GTFS archives.
  if (has_calendar_table) {
    db.exec(`
      CREATE TEMPORARY VIEW tmp_calendar
        AS SELECT * FROM ${RAW_GTFS}.calendar ;
    `);
  } else {
    db.exec(`
      CREATE TEMPORARY TABLE IF NOT EXISTS tmp_calendar (
        service_id  TEXT,
        monday      INTEGER,
        tuesday     INTEGER,
        wednesday   INTEGER,
        thursday    INTEGER,
        friday      INTEGER,
        saturday    INTEGER,
        sunday      INTEGER,
        start_date  TEXT,
        end_date    TEXT
      ) ;
    `);
  }

  if (has_calendar_dates_table) {
    db.exec(`
      CREATE TEMPORARY VIEW tmp_calendar_dates
        AS SELECT * FROM ${RAW_GTFS}.calendar_dates ;
    `);
  } else {
    db.exec(`
      CREATE TEMPORARY TABLE IF NOT EXISTS tmp_calendar_dates (
        service_id      TEXT,
        date            TEXT,
        exception_type  TEXT
      ) ;
    `);
  }

  db.exec(`
    DROP TABLE IF EXISTS ${SCHEMA}.service_dates;

    CREATE TABLE ${SCHEMA}.service_dates (
      service_id  TEXT NOT NULL,
      date        TEXT NOT NULL,
      dow         INTEGER NOT NULL,

      PRIMARY KEY(service_id, date)
    ) WITHOUT ROWID ;

    INSERT INTO ${SCHEMA}.service_dates
      WITH RECURSIVE cte_date_extents AS (
          SELECT
              date(
                substr(start_d, 1, 4)
                || '-'
                || substr(start_d, 5, 2)
                || '-'
                || substr(start_d, 7, 2)
              ) AS min_date,
              date(
                substr(end_d, 1, 4)
                || '-'
                || substr(end_d, 5, 2)
                || '-'
                || substr(end_d, 7, 2)
              ) AS max_date
            FROM (
              SELECT
                  MIN(start_date) AS start_d,
                  MAX(end_date) AS end_d
                FROM tmp_calendar
            )
        ), cte_dates_and_dows(date, dow) AS (
          SELECT
              min_date AS date,
              CAST(
                strftime('%w', min_date) AS INTEGER
              ) AS dow
            FROM cte_date_extents
          UNION ALL
          SELECT
              date(
                 date,
                '+1 day'
              ) AS date,
              CAST(
                strftime('%w', date( date, '+1 day' )) AS INTEGER
              ) AS dow
            FROM cte_dates_and_dows
            WHERE date < (SELECT max_date FROM cte_date_extents)
        ), cte_service_calendar (service_id, service_dows, start_date, end_date) AS (
          SELECT
              service_id,
              json_array(
                sunday,
                monday,
                tuesday,
                wednesday,
                thursday,
                friday,
                saturday,
                sunday
              ) AS dows,
              start_date,
              end_date
            FROM tmp_calendar
        ), cte_service_dates AS (
          SELECT
              *
            FROM (
              SELECT
                  service_id,
                  replace(date, '-', '') AS date,
                  dow
                FROM cte_service_calendar AS a
                  CROSS JOIN cte_dates_and_dows AS b
                WHERE (
                  (
                    CAST(
                      json_extract(a.service_dows, '$[' || b.dow || ']')
                      AS INTEGER
                    ) = 1
                  )
                  AND
                  ( replace(date, '-', '') >= start_date )
                  AND
                  ( replace(date, '-', '') <= end_date )
                )
              UNION
              SELECT
                  service_id,
                  date,
                  CAST(
                    strftime(
                      '%w',
                      (
                        substr(date, 1, 4)
                        || '-'
                        || substr(date, 5, 2)
                        || '-'
                        || substr(date, 7, 2)
                      )
                    ) AS INTEGER
                  ) AS dow
                FROM tmp_calendar_dates
                WHERE ( exception_type = 1 )
            )
          EXCEPT
          SELECT
              service_id,
              date,
              CAST(
                strftime(
                  '%w',
                    (
                      substr(date, 1, 4)
                      || '-'
                      || substr(date, 5, 2)
                      || '-'
                      || substr(date, 7, 2)
                    )
                ) AS INTEGER
              ) AS dow
            FROM tmp_calendar_dates
            WHERE ( exception_type = 2 )
        )
          SELECT
              service_id,
              date,
              dow
            FROM cte_service_dates
        ;
  `);
};

module.exports = {
  createScheduledTransitTrafficTable,
  createServiceDatesTable,
};
