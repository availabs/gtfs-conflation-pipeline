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

    const that = { db, sqliteFilePath, supportedGtfsTables };

    this.createTable = createTable.bind(that);

    Object.keys(schemaQueries).forEach(methodName => {
      this[methodName] = schemaQueries[methodName].bind(that);
    });

    this.getSqliteFilePath = getSqliteFilePath.bind(that);
  }

  getTableNameForGtfsFileName(fileName) {
    if (!fileName) {
      return null;
    }

    // to lowercase and remove .txt filename extension
    const tableName = fileName.toLowerCase().slice(0, -4);

    return supportedGtfsTables.includes(tableName) ? tableName : null;
  }
}

module.exports = RawGtfsDbService;
