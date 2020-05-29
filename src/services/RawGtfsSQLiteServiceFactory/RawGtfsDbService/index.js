/* eslint-disable class-methods-use-this */

const { join, isAbsolute } = require('path');

const Database = require('better-sqlite3');

const SQLITE_FILE_NAME = 'raw_gtfs';

const supportedGtfsTables = [
  'agency',
  'stops',
  'routes',
  'trips',
  'stop_times',
  'calendar',
  'calendar_dates',
  'fare_attributes',
  'fare_rules',
  'shapes',
  'frequencies',
  'transfers',
  'feed_info'
];

const createTable = require('./createTable');
const schemaQueries = require('./schemaQueries');

function getSqliteFilePath() {
  return this.sqliteFilePath;
}

class RawGtfsDbService {
  constructor(sqlite_dir) {
    if (!sqlite_dir) {
      throw new Error('sqlite_dir parameter is required');
    }

    const dir = isAbsolute(sqlite_dir)
      ? sqlite_dir
      : join(process.cwd(), sqlite_dir);

    const sqliteFilePath = join(dir, SQLITE_FILE_NAME);

    const db = new Database(sqliteFilePath);

    // Encasulates internal state
    const that = { db, sqliteFilePath, supportedGtfsTables };

    // Internal functions access internal state
    that.createTable = createTable.bind(that);

    // External functions see internal state within.
    this.createTable = that.createTable;

    // Bind all functions exported from the module
    Object.keys(schemaQueries).forEach(k => {
      if (typeof schemaQueries[k] === 'function') {
        that[k] = schemaQueries[k].bind(that);
        this[k] = that[k];
      }
    });

    that.getSqliteFilePath = getSqliteFilePath.bind(that);
    this.getSqliteFilePath = that.getSqliteFilePath;
  }

  getTableNameForGtfsFileName(fileName) {
    if (!fileName) {
      return null;
    }

    // Table names are the file names with .txt extension removed.
    const name = fileName.toLowerCase().slice(0, -4);

    const tableName = supportedGtfsTables.includes(name) ? name : null;

    return tableName;
  }
}

module.exports = RawGtfsDbService;
