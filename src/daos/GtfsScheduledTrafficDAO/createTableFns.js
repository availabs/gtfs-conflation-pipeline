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

const _ = require("lodash");
const { RAW_GTFS } = require("../../constants/databaseSchemaNames");
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

const createTemporaryGtfsTables = (db) => {
  // Determine which tables are included in this GTFS feed.
  const { has_feed_info, has_calendar_table, has_calendar_dates_table } = db
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
                  ( name = 'feed_info' )
                )
            ) AS has_feed_info,
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

  if (!(has_feed_info || has_calendar_table || has_calendar_dates_table)) {
    throw new Error(`GTFS feed must have at least one of the following files:
      * feed_info
      * calendar
      * calendar_dates
    `);
  }

  if (has_feed_info) {
    db.exec(`
      -- Create an alias VIEW
      CREATE TEMPORARY VIEW tmp_feed_info
        AS SELECT * FROM ${RAW_GTFS}.feed_info
      ;
    `);
  } else {
    db.exec(`
      -- Create an empty table so later SQL queries can assume its existence.
      CREATE TEMPORARY TABLE IF NOT EXISTS tmp_feed_info (
        feed_start_date      TEXT,
        feed_end_date        TEXT
      ) ;
    `);
  }

  // Because the calendar and calendar_dates tables are optional,
  //   we create views so that the CREATE service_dates table
  //   is uniform across GTFS archives.
  if (has_calendar_table) {
    db.exec(`
      -- Create an alias VIEW
      CREATE TEMPORARY VIEW tmp_calendar
        AS SELECT * FROM ${RAW_GTFS}.calendar
      ;
    `);
  } else {
    db.exec(`
      -- Create an empty table so later SQL queries can assume its existence.
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
      -- Create an alias VIEW
      CREATE TEMPORARY VIEW tmp_calendar_dates
        AS SELECT * FROM ${RAW_GTFS}.calendar_dates
      ;
    `);
  } else {
    db.exec(`
      -- Create an empty table so later SQL queries can assume its existence.
      CREATE TEMPORARY TABLE IF NOT EXISTS tmp_calendar_dates (
        service_id      TEXT,
        date            TEXT,
        exception_type  TEXT
      ) ;
    `);
  }
};

const createFeedDateExtentsTable = (db) => {
  // Get the official feed start date
  const { feed_start_date } =
    // Prefer the feed_info start_date
    db
      .prepare(
        `
          SELECT
              MIN(feed_start_date) AS feed_start_date
            FROM tmp_feed_info
            WHERE ( feed_start_date IS NOT NULL )
          ;
        `
      )
      .get() ||
    // Fall back to the the calendar tables
    db
      .prepare(
        `
          SELECT
              MIN(date) AS feed_start_date
            FROM (
              SELECT
                  MIN(start_date) AS date
                FROM tmp_calendar
              UNION
              SELECT
                  MIN(date) AS date
                FROM tmp_calendar_dates
                WHERE ( exception_type = 1 )
            )
          ;
        `
      )
      .get() ||
    {};

  // Get the official feed end date
  const { feed_end_date } =
    // Prefer the feed_info date extent
    db
      .prepare(
        `
          SELECT
              MAX(feed_end_date) AS feed_end_date
            FROM tmp_feed_info
            WHERE ( feed_end_date IS NOT NULL )
          ;
        `
      )
      .get() ||
    // Fall back to the the calendar tables
    db
      .prepare(
        `
          SELECT
              MAX(date) AS feed_end_date
            FROM (
              SELECT
                  MAX(end_date) AS date
                FROM tmp_calendar
              UNION
              SELECT
                  MAX(date) AS date
                FROM tmp_calendar_dates
                WHERE ( exception_type = 1 )
            )
          ;
        `
      )
      .get() ||
    {};

  if (_.isNaN(feed_start_date) || _.isNil(feed_end_date)) {
    throw new Error("Unable to determine the feed date extent.");
  }

  db.exec(`
    DROP TABLE IF EXISTS ${SCHEMA}.feed_date_extent;

    CREATE TABLE ${SCHEMA}.feed_date_extent
      AS
        SELECT
            column1 AS feed_start_date,
            column2 AS feed_end_date
          FROM ( VALUES ( '${feed_start_date}', '${feed_end_date}' ) )
    ;
  `);
};

const createTemporaryServiceDatesAndDowsTable = (db) => {
  db.exec(`
    CREATE TEMPORARY TABLE tmp_dates_and_dows
      AS
        WITH RECURSIVE cte_dates_and_dows(service_date) AS (
          -- Generate all (date, dow) tuples within the feed_date_extent
          -- See: https://stackoverflow.com/a/32987070/3970755
          SELECT
              (
                substr(feed_start_date , 1, 4)
                || '-'
                || substr(feed_start_date, 5, 2)
                || '-'
                || substr(feed_start_date, 7, 2)
              ) AS service_date
            FROM feed_date_extent
          UNION ALL
          SELECT
              date(
                service_date,
                '+1 day'
              ) AS service_date
            FROM cte_dates_and_dows
            WHERE (
              -- NOTE: Feed end date is inclusive. This filter applied before incrementing date.
              (
                replace(service_date, '-', '')
                < (SELECT feed_end_date FROM feed_date_extent)
              )
            )
        )
        SELECT
            -- Revert to GTFS date format YYYYMMDD
            replace(service_date, '-', '') AS date,
            CAST(
              strftime('%w', service_date) AS INTEGER
            ) AS dow
          FROM cte_dates_and_dows
    ;
  `);
};

const createServiceDatesTable = (db) => {
  createTemporaryGtfsTables(db);
  createFeedDateExtentsTable(db);
  createTemporaryServiceDatesAndDowsTable(db);

  db.exec(`
    DROP TABLE IF EXISTS ${SCHEMA}.service_dates;

    CREATE TABLE ${SCHEMA}.service_dates (
      service_id  TEXT NOT NULL,
      date        TEXT NOT NULL,
      dow         INTEGER NOT NULL,

      PRIMARY KEY(service_id, date)
    ) WITHOUT ROWID ;

    INSERT INTO ${SCHEMA}.service_dates
      SELECT
          service_id,
          date,
          dow
        FROM (
          -- Dates of service within date_extent based on calendar table
          SELECT
              service_id,
              a.date,
              dow
            FROM tmp_dates_and_dows AS a
              INNER JOIN (
                SELECT
                    service_id,
                    -- This array is used to filter out dates based on DOW.
                    json_array(
                      sunday,
                      monday,
                      tuesday,
                      wednesday,
                      thursday,
                      friday,
                      saturday,
                      sunday
                    ) AS service_dows,
                    start_date,
                    end_date
                  FROM tmp_calendar
              ) AS b
                ON (
                  -- Does the service run on this day of the week?
                  (
                    CAST(
                      json_extract(b.service_dows, '$[' || a.dow || ']')
                      AS INTEGER
                    ) = 1
                  )
                  AND
                  -- Does the date fall within the specific service's start and end dates?
                  (
                    ( a.date >= b.start_date )
                    AND
                    ( a.date <= b.end_date )
                  )
                )

          -- Add service dates where calendar_dates specifies service added exception_type
          UNION

          SELECT
              service_id,
              date,
              dow
            FROM tmp_calendar_dates AS a
              INNER JOIN tmp_dates_and_dows AS b
                USING ( date )
              INNER JOIN feed_date_extent AS c
            WHERE (
              -- Exception type is service added
              ( a.exception_type = 1 )
            )
        ) AS sub_included

      -- Remove service dates where calendar_dates specifies service removed exception_type
      EXCEPT

      SELECT
          service_id,
          date,
          CAST( strftime( '%w', date ) AS INTEGER ) AS dow
        FROM tmp_calendar_dates
          INNER JOIN tmp_dates_and_dows AS b
            USING ( date )
          INNER JOIN feed_date_extent AS c
        WHERE (
          -- Exception type is service added
          ( exception_type = 2 )
        )
    ;
  `);
};

module.exports = {
  createScheduledTransitTrafficTable,
  createServiceDatesTable,
};
