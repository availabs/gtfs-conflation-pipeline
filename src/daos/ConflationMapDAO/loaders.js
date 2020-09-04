/* eslint-disable no-restricted-syntax, jsdoc/require-jsdoc, no-continue */

const { join, isAbsolute } = require("path");

const Database = require("better-sqlite3");

const turf = require("@turf/turf");
const _ = require("lodash");

const db = require("../../services/DbService");

const SCHEMA = require("./DATABASE_SCHEMA_NAME");
const { createConflationMapTable } = require("./createTableFns");
const roundGeometryCoordinates = require("../../utils/roundGeometryCoordinates");

const targetMaps = [
  "ris_2016",
  "ris_2017",
  "ris_2018",
  "ris_2019",
  "npmrds_2017",
  "npmrds_2019",
];

const usefulTargetMapProperties = [
  "targetMapId",
  "targetMapMesoId",
  "targetMapMacroId",
  "targetMapMegaId",
  "targetMapNetHrchyRank",
  "targetMapMesoLevelIdx",
];

function load(conflationMapSqlitePath) {
  try {
    db.prepare("BEGIN;").run();

    db.exec(`DROP TABLE IF EXISTS ${SCHEMA}.conflation_map;`);

    createConflationMapTable(db);

    const insertStmt = db.prepare(`
      INSERT INTO ${SCHEMA}.conflation_map (
          id,
          shst_reference,
          networklevel,
          length_km,
          feature
        ) VALUES (?, ?, ?, ?, ?) ;
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
        properties: { shstReferenceId: shstRef = null, networklevel },
      } = feature;

      if (_.isNil(shstRef)) {
        // console.warn(
        // "INVARIANT BROKEN: Conflation map segment without a shstRef"
        // );
        continue;
      }

      const length_km = turf.length(feature);

      // We may be able to use these properties to string together
      //   topologically sorted sequences of ShSt references.
      for (const targetMap of targetMaps) {
        feature.properties[targetMap] = feature.properties[targetMap]
          ? _.pick(feature.properties[targetMap], usefulTargetMapProperties)
          : null;
      }

      roundGeometryCoordinates(feature);

      insertStmt.run([
        id,
        shstRef,
        networklevel,
        length_km,
        JSON.stringify(feature),
      ]);
    }

    db.prepare("COMMIT;").run();
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

module.exports = {
  load,
};
