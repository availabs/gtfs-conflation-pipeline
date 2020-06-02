/* eslint-disable no-await-in-loop, no-restricted-syntax, jsdoc/require-jsdoc, global-require */
const tmp = require('tmp');
const _ = require('lodash');

const DATABASE_SCHEMA_NAME = require('./DATABASE_SCHEMA_NAME');

const N = 10;
const SAMPLE_ROWS = _.range(N).map(i => ({
  stop_id: i + 1,
  stop_lat: i + 10,
  stop_lon: i * 10
}));

const T = 30; // ms

async function* asyncStopsIterator() {
  for (let i = 0; i < SAMPLE_ROWS.length; ++i) {
    yield SAMPLE_ROWS[i];
    await new Promise(resolve => setTimeout(resolve, T));
  }
}

let db;
let RawGtfsDAO;
let rmTmpDir;

jest.setTimeout(3000);

beforeEach(() =>
  jest.isolateModules(() => {
    const { name: tmpDirName, removeCallback } = tmp.dirSync({
      unsafeCleanup: true
    });

    rmTmpDir = removeCallback;

    process.env.AVL_GTFS_CONFLATION_OUTPUT_DIR = tmpDirName;

    db = require('../../../services/DbService');
    RawGtfsDAO = require('.');
  })
);

afterEach(() => {
  rmTmpDir();
});

describe('RawGtfsDAO loaders', () => {
  test('loadAsync to load database table', async done => {
    const rawGtfsDAO = new RawGtfsDAO();

    // Send a query from the standard db connection
    rawGtfsDAO.listTables();

    // Load the data using the exclusive db connection
    const rowCt = await rawGtfsDAO.loadAsync('stops.txt', asyncStopsIterator());

    expect(rowCt).toBe(SAMPLE_ROWS.length);

    const tables = rawGtfsDAO.listTables();
    expect(tables).toEqual(['stops']);

    const rows = [...rawGtfsDAO.makeStopsIterator()].sort(
      (a, b) => +a.stop_id - +b.stop_id
    );
    const nonNullCols = ['stop_id', 'stop_lat', 'stop_lon'];

    for (let i = 0; i < SAMPLE_ROWS.length; ++i) {
      const actual = rows[i];
      const expected = SAMPLE_ROWS[i];

      Object.keys(actual).forEach(k => {
        if (k === 'stop_id') {
          expect(actual[k]).toBe(`${expected[k]}`);
        } else if (nonNullCols.includes(k)) {
          expect(actual[k]).toBe(expected[k]);
        } else {
          expect(actual[k]).toBe(null);
        }
      });
    }

    done();
  });

  test('loadAsync ISOLATION level is READ COMMITTED (writes)', async done => {
    const rawGtfsDAO = new RawGtfsDAO();

    const stmts = [
      `CREATE TABLE IF NOT EXISTS ${DATABASE_SCHEMA_NAME}.foo (id INT);`,
      `DROP TABLE IF EXISTS ${DATABASE_SCHEMA_NAME}.foo;`
    ].map(s => db.prepare(s));

    const testTransaction = db.transaction(() => {
      for (const stmt of stmts) {
        stmt.run();
      }
    });

    const errMsg = 'database is locked';

    expect(testTransaction).not.toThrow();

    const loading = rawGtfsDAO.loadAsync('stops.txt', asyncStopsIterator());

    expect(testTransaction).toThrow(errMsg);

    await loading;

    expect(testTransaction).not.toThrow();

    done();
  });

  test('loadAsync ISOLATION level is READ COMMITTED (reads)', async done => {
    const rawGtfsDAO = new RawGtfsDAO();

    const q = `SELECT * FROM ${DATABASE_SCHEMA_NAME}.stops;`;
    const errMsg = `no such table: ${DATABASE_SCHEMA_NAME}.stop`;

    expect(() => db.exec(q)).toThrow(errMsg);

    const loading = rawGtfsDAO.loadAsync('stops.txt', asyncStopsIterator());

    expect(() => db.exec(q)).toThrow(errMsg);

    await loading;

    expect(() => db.exec(q)).not.toThrow();

    done();
  });
});
