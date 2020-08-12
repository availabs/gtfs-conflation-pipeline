/* eslint-disable no-restricted-syntax, jsdoc/require-jsdoc, no-continue */

// https://github.com/sharedstreets/sharedstreets-js/blob/d4a340109e10b84688fc4213779585f054171005/src/graph.ts#L260-L275

const turf = require("@turf/turf");
const _ = require("lodash");

const db = require("../../../services/DbService");

const roundGeometryCoordinates = require("../../../utils/roundGeometryCoordinates");

const GtfsNetworkDAOFactory = require("../../GtfsNetworkDAOFactory");

const SCHEMA = require("./DATABASE_SCHEMA_NAME");

const { matchSegmentedShapeFeatures } = require("./SharedStreetsMatcher");

const chooseShstMatchesForShape = require("./chooseShstMatchesForShape");

const PRECISION = 6;

async function loadRawShStMatches(xdb) {
  // Step 1: Iterate in geospatial order and collect matches in TEMP table.
  xdb.exec(`
      DROP TABLE IF EXISTS ${SCHEMA}.tmp_shst_match_features;

      CREATE TABLE IF NOT EXISTS ${SCHEMA}.tmp_shst_match_features (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        shape_id        TEXT,
        shape_index     INTEGER,
        shst_reference  TEXT,
        section_start   REAL,
        section_end     REAL,
        osrm_dir        TEXT,
        feature_len_km  REAL,
        feature         TEXT,
        
        UNIQUE (shape_id, shape_index, shst_reference, section_start, section_end)
      ) ;
  `);

  const insertShstMatchStmt = xdb.prepare(`
      INSERT OR IGNORE INTO tmp_shst_match_features (
        shape_id,
        shape_index,
        shst_reference,
        section_start,
        section_end,
        osrm_dir,
        feature_len_km,
        feature
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ;
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

    const sectionStartRounded = _.round(section_start, PRECISION);
    const sectionEndRounded = _.round(section_end, PRECISION);

    const featureLenKm = _.round(turf.length(matchFeature), 6);

    insertShstMatchStmt.run([
      `${pp_shape_id}`,
      `${pp_shape_index}`,
      `${shstReferenceId}`,
      `${sectionStartRounded}`,
      `${sectionEndRounded}`,
      `${osrm_dir}`,
      `${featureLenKm}`,
      `${JSON.stringify(matchFeature)}`
    ]);
  }
}

// Step 2: Iterate over matches in shape_id, shape_index order
//         and use graph connectivity to choose matches.
//         If shape is unconnected, use OSRM to help ShSt matching.
function loadProcessedShstMatches(xdb) {
  xdb.exec(`
    DROP TABLE IF EXISTS ${SCHEMA}.gtfs_shape_shst_match_paths;

    CREATE TABLE IF NOT EXISTS ${SCHEMA}.gtfs_shape_shst_match_paths (
      gtfs_shape_id     INTEGER,
      gtfs_shape_index  INTEGER,
      path_index        INTEGER,
      path_edge_index   INTEGER,
      shst_match_id     INTEGER,
      shst_reference    TEXT,
      shst_ref_start    REAL,
      shst_ref_end      REAL,
      
      PRIMARY KEY (gtfs_shape_id, gtfs_shape_index, path_index, path_edge_index)
    ) WITHOUT ROWID;
  `);

  const insertStmt = xdb.prepare(`
    INSERT OR IGNORE INTO gtfs_shape_shst_match_paths (
      gtfs_shape_id,
      gtfs_shape_index,
      path_index,
      path_edge_index,
      shst_match_id,
      shst_reference,
      shst_ref_start,
      shst_ref_end
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ;
  `);

  const iter = this.makeShapeMatchesIterator();

  for (const gtfsShapeShstMatches of iter) {
    const chosenPaths = chooseShstMatchesForShape(gtfsShapeShstMatches);

    if (_.isEmpty(chosenPaths)) {
      continue;
    }

    for (let i = 0; i < chosenPaths.length; ++i) {
      const paths = chosenPaths[i];

      if (_.isEmpty(paths)) {
        continue;
      }

      for (let path_index = 0; path_index < paths.length; ++path_index) {
        const {
          properties: { shape_id, shape_index, pathDecompositionInfo }
        } = paths[path_index];

        if (_.isEmpty(pathDecompositionInfo)) {
          continue;
        }

        for (
          let path_edge_index = 0;
          path_edge_index < pathDecompositionInfo.length;
          ++path_edge_index
        ) {
          const {
            id: shst_match_id,
            shstReferenceId: shst_reference = null,
            shstReferenceSection: [
              shst_ref_start = null,
              shst_ref_end = null
            ] = []
          } = pathDecompositionInfo[path_edge_index];

          insertStmt.run([
            shape_id,
            shape_index,
            path_index,
            path_edge_index,
            shst_match_id,
            shst_reference,
            shst_ref_start,
            shst_ref_end
          ]);
        }
      }
    }
  }
}

async function load() {
  const xdb = db.openLoadingConnectionToDb(SCHEMA);

  try {
    db.unsafeMode(true);
    xdb.unsafeMode(true);

    xdb.exec("BEGIN");
    await loadRawShStMatches(xdb);
    xdb.exec("COMMIT");

    xdb.exec("BEGIN");
    loadProcessedShstMatches.call(this, xdb);
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
