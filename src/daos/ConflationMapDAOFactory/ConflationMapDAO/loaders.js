/* eslint-disable no-restricted-syntax, jsdoc/require-jsdoc, no-continue */

const { join, isAbsolute } = require("path");

const Database = require("better-sqlite3");
const _ = require("lodash");

const db = require("../../../services/DbService");

const SCHEMA = require("./DATABASE_SCHEMA_NAME");
const { createConflationMapTable } = require("./createTableFns");
const roundGeometryCoordinates = require("../../../utils/roundGeometryCoordinates");

const PRECISION = 6;

function load(conflationMapSqlitePath) {
  try {
    db.prepare("BEGIN;").run();

    db.exec(`DROP TABLE IF EXISTS ${SCHEMA}.conflation_map;`);

    createConflationMapTable(db);

    const insertStmt = db.prepare(`
      INSERT INTO ${SCHEMA}.conflation_map (
          id,
          shst_reference,
          feature
        ) VALUES (?, ?, ?) ;
    `);

    const dbPath = isAbsolute(conflationMapSqlitePath)
      ? conflationMapSqlitePath
      : join(process.cwd(), conflationMapSqlitePath);

    const rDB = new Database(dbPath);
    const readIterator = rDB
      .prepare(
        `
        SELECT
            id,
            feature
          FROM conflation_map
          ORDER BY id ; `
      )
      .raw()
      .iterate();

    for (const [id, fStr] of readIterator) {
      const feature = JSON.parse(fStr);

      const {
        properties: { shstReferenceId: shstRef = null }
      } = feature;

      if (_.isNil(shstRef)) {
        continue;
      }

      feature.properties = {
        shstRef,
        startDist: _.round(
          _.get(feature, ["properties", "startDist"], null),
          PRECISION
        ),
        endDist: _.round(
          _.get(feature, ["properties", "endDist"], null),
          PRECISION
        )
      };

      roundGeometryCoordinates(feature);

      insertStmt.run([id, shstRef, JSON.stringify(feature)]);
    }

    db.prepare("COMMIT;").run();
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

module.exports = {
  load
};
