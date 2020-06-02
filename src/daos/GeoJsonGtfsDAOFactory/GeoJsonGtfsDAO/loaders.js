/* eslint-disable no-restricted-syntax, jsdoc/require-jsdoc */

const db = require('../../../services/DbService');

const formatRow = require('../../../utils/formatRowForSqliteInsert');

const SCHEMA = require('./DATABASE_SCHEMA_NAME');

const getGeoProximityKey = require('../../../utils/getGeoProximityKey');

const { createStopsTable, createShapesTable } = require('./createTableFns');

function loadFeatures(tableName, featureIterator, opts) {
  const { clean } = opts;

  db.unsafeMode(true);

  try {
    db.exec('BEGIN');

    if (clean) {
      db.exec(`DROP TABLE IF EXISTS ${SCHEMA}.${tableName};`);
    }

    if (tableName === 'stops') {
      createStopsTable(db);
    } else if (tableName === 'shapes') {
      createShapesTable(db);
    } else {
      throw new Error(`UNSUPPORTED table ${tableName}`);
    }

    const stopInsertStmt = db.prepare(`
    INSERT INTO ${SCHEMA}.${tableName} (
      id,
      geoprox_key,
      feature
    ) VALUES (?, ?, ?);
  `);

    for (const feature of featureIterator) {
      const { id } = feature;
      const geoprox_key = getGeoProximityKey(feature);
      const stringifiedFeature = JSON.stringify(feature);

      const params = formatRow(['id', 'geoprox_key', 'feature'], {
        id,
        geoprox_key,
        feature: stringifiedFeature
      });

      stopInsertStmt.run(params);
    }

    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  } finally {
    db.unsafeMode(false);
  }
}

function loadStops(stopsIterator, opts) {
  loadFeatures('stops', stopsIterator, opts);
}

function loadShapes(shapesIterator, opts) {
  loadFeatures('shapes', shapesIterator, opts);
}

module.exports = {
  loadStops,
  loadShapes
};
