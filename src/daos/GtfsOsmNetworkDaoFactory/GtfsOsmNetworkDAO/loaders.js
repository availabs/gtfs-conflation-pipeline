/* eslint-disable no-restricted-syntax, jsdoc/require-jsdoc, no-continue */

// https://github.com/sharedstreets/sharedstreets-js/blob/d4a340109e10b84688fc4213779585f054171005/src/graph.ts#L260-L275

const turf = require("@turf/turf");
const _ = require("lodash");

const db = require("../../../services/DbService");

const roundGeometryCoordinates = require("../../../utils/roundGeometryCoordinates");

const GtfsNetworkDAOFactory = require("../../GtfsNetworkDAOFactory");

const SCHEMA = require("./DATABASE_SCHEMA_NAME");

const { matchSegmentedShapeFeatures } = require("./SharedStreetsMatcher");

const PRECISION = 6;

async function load() {
  const xdb = db.openLoadingConnectionToDb(SCHEMA);

  db.unsafeMode(true);
  xdb.unsafeMode(true);

  try {
    xdb.exec("BEGIN");

    // Step 1: Iterate in geospatial order and collect matches in TEMP table.
    xdb.exec(`
      DROP TABLE IF EXISTS ${SCHEMA}.tmp_shst_match_features;
      DROP TABLE IF EXISTS ${SCHEMA}.tmp_gtfs_network_matches;

      CREATE TABLE IF NOT EXISTS ${SCHEMA}.tmp_shst_match_features (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        shst_reference  TEXT,
        section_start   REAL,
        section_end     REAL,
        osrm_dir        TEXT,
        feature_len_km  REAL,
        feature         TEXT,
        
        UNIQUE (shst_reference, section_start, section_end)
      ) ;

      CREATE TABLE IF NOT EXISTS ${SCHEMA}.tmp_gtfs_network_matches (
        shape_id          TEXT,
        shape_index       INTEGER,
        shst_reference    TEXT,
        section_start     REAL,
        section_end       REAL,

        PRIMARY KEY (shape_id, shape_index, shst_reference, section_start, section_end)
      ) WITHOUT ROWID;
  `);

    const insertShstMatchStmt = xdb.prepare(`
      INSERT OR IGNORE INTO tmp_shst_match_features (
        shst_reference,
        section_start,
        section_end,
        osrm_dir,
        feature_len_km,
        feature
      ) VALUES (?, ?, ?, ?, ?, ?) ;
    `);

    const insertGtfsShapeSegMatchStmt = xdb.prepare(`
      INSERT OR IGNORE INTO tmp_gtfs_network_matches (
        shape_id,
        shape_index,
        shst_reference,
        section_start,
        section_end
      ) VALUES (?, ?, ?, ?, ?) ;
    `);

    const gtfsNetworkDAO = GtfsNetworkDAOFactory.getDAO();

    const iter = gtfsNetworkDAO.makeShapeSegmentsIterator();

    const matchesIter = matchSegmentedShapeFeatures(iter);

    for await (const { matchFeature, osrm_dir } of matchesIter) {
      const {
        properties: {
          shstReferenceId,
          section: [section_start, section_end],
          pp_shape_id,
          pp_shape_index
        }
      } = matchFeature;

      roundGeometryCoordinates(matchFeature);

      const start = _.round(section_start, PRECISION);
      const end = _.round(section_end, PRECISION);

      const featureLenKm = _.round(turf.length(matchFeature), 6);

      insertShstMatchStmt.run([
        `${shstReferenceId}`,
        `${start}`,
        `${end}`,
        `${osrm_dir}`,
        `${featureLenKm}`,
        `${JSON.stringify(matchFeature)}`
      ]);

      insertGtfsShapeSegMatchStmt.run([
        `${pp_shape_id}`,
        `${pp_shape_index}`,
        `${shstReferenceId}`,
        `${start}`,
        `${end}`
      ]);
    }

    // TODO: Iterate over all tmp_shst_match_features and set feature id to row id

    // Step 2: Iterate over matches in shape_id, shape_index order
    //         and use graph connectivity to choose matches.
    //         If shape is unconnected, use OSRM to help ShSt matching.

    xdb.exec("COMMIT;");
  } catch (err) {
    console.error(err);
    xdb.exec("ROLLBACK");
    throw err;
  } finally {
    db.unsafeMode(false);
    xdb.unsafeMode(false);
    db.closeLoadingConnectionToDb(xdb);
  }
}

module.exports = {
  load
};
