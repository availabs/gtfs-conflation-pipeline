/* eslint-disable no-restricted-syntax, no-await-in-loop, no-param-reassign */

const { spawn } = require("child_process");
const { writeFileSync, readFileSync, existsSync } = require("fs");
const { join, dirname } = require("path");

const tmp = require("tmp");
const turf = require("@turf/turf");
const _ = require("lodash");
const { pipe, through } = require("mississippi");
const split = require("split2");

const replaceFeaturesGeomsWithOsrmRoute = require("./replaceFeaturesGeomsWithOsrmRoute");
const doubleLineStringPoints = require("./doubleLineStringPoints");

const UTF8_ENCODING = "utf8";

const INF_PATH = "features.geojson";
const OUTF_PATH = "shst_match_output.geojson";
const MATCHED_PATH = OUTF_PATH.replace(/geojson$/, "matched.geojson");

const PROJECT_ROOT = join(__dirname, "../../../../");
const SHST_DATA_DIR = join(PROJECT_ROOT, "data/shst/");
const SHST_PATH = join(PROJECT_ROOT, "node_modules/.bin/shst");

const MATCH = "MATCH";
const ROUTE = "ROUTE";
const DISTANCE_SLICE_METHOD = "DISTANCE_SLICE_METHOD";
const BEARING_SLICE_METHOD = "BEARING_SLICE_METHOD";

const SHST_CHILD_PROC_OPTS = {
  cwd: PROJECT_ROOT,
  env: { ...process.env, HOME: SHST_DATA_DIR },
};

const SHST_DATA_DIR_REGEXP = new RegExp(
  `(${SHST_DATA_DIR.replace(".", "\n").replace("/", "\\/")}.*)`
);

// const PEDESTRIAN = "--match-pedestrian";
// const BIKE = "--match-bike";
// const CAR = "--match-car";
// const MOTORWAYS_ONLY = "--match-motorway-only";
// const SURFACE_STREETS_ONLY = "--match-surface-streets-only";

const MAX_FEATURE_LENGTH = 2; /* km */
const MATCHES_LENGTH_RATIO_THOLD = 0.1;

const runShstMatch = (inFilePath, outFilePath, flags) => {
  return new Promise((resolve) => {
    // Why not runSync>
    const cp = spawn(
      `${SHST_PATH}`,
      _.concat(
        [
          "match",
          `${inFilePath}`,
          "--follow-line-direction",
          "--tile-hierarchy=8",
          `--out=${outFilePath}`,
        ],
        flags
      ).filter(_.negate(_.isNil)),
      SHST_CHILD_PROC_OPTS
    );

    let osrmDir = null;

    pipe(
      cp.stdout,
      split(),
      through(function fn(line, _$, cb) {
        console.log(line.toString());

        const pathMatch = line.toString().match(SHST_DATA_DIR_REGEXP);
        if (pathMatch) {
          const [osrmLocation] = pathMatch;

          osrmDir = dirname(osrmLocation);
        }

        cb();
      }),
      (err) => {
        if (err) {
          console.error(err);
        }
      }
    );

    // FIXME: Why?
    pipe(
      cp.stderr,
      split(),
      through(function fn(line, _$, cb) {
        console.error(line.toString());
        cb();
      }),
      (err) => {
        if (err) {
          console.error(err);
        }
      }
    );

    cp.on("error", (err) => {
      console.error(err);
    });

    cp.on("exit", (code) => {
      if (code !== 0) {
        console.error(`WARNING: shst match exited with code ${code}.`);
      }

      return resolve(osrmDir);
    });
  });
};

const collectMatchedFeatures = (matchedFilePath) => {
  const matchedFeatureCollection = existsSync(matchedFilePath)
    ? JSON.parse(readFileSync(matchedFilePath, UTF8_ENCODING))
    : null;

  const matchedFeatures = _.get(matchedFeatureCollection, "features", []);

  return matchedFeatures.length ? matchedFeatures : null;
};

const preprocessFeatures = (features) =>
  features.reduce((acc, feature) => {
    const len = turf.length(feature);

    const numSegs = Math.ceil(len / MAX_FEATURE_LENGTH);

    if (numSegs < 2) {
      acc.push(feature);
      return acc;
    }

    // if the feature's length is at least 1.5x the max length,
    //   we split it into equal sized chunks because ShSt had
    //   poor matching results for long features.

    const segLen = len / numSegs;

    let start_dist = 0;
    let prevSegEndCoords;
    for (let i = 0; i < numSegs; ++i) {
      const stop_dist = start_dist + segLen;

      const featureSlice = turf.lineSliceAlong(feature, start_dist, stop_dist);

      featureSlice.id = feature.id;
      featureSlice.properties = feature.properties;

      // Ensure connectivity
      if (i !== 0) {
        featureSlice.geometry.coordinates[0] = prevSegEndCoords;
      }

      const coords = turf.getCoords(featureSlice);

      const processedFeature =
        coords.length < 10 ? doubleLineStringPoints(feature) : feature;

      acc.push(processedFeature);

      start_dist = stop_dist;
      prevSegEndCoords = _.last(turf.getCoords(featureSlice));
    }

    return acc;
  }, []);

const match = async ({ features, flags }) => {
  if (!(Array.isArray(features) && features.length)) {
    return null;
  }

  const preprocessedFeatures = preprocessFeatures(features);

  const featureCollection = turf.featureCollection(preprocessedFeatures);

  const { name: workDirName, removeCallback: cleanup } = tmp.dirSync({
    unsafeCleanup: true,
  });

  const inFilePath = join(workDirName, INF_PATH);
  const outFilePath = join(workDirName, OUTF_PATH);

  const matchedFilePath = join(workDirName, MATCHED_PATH);

  writeFileSync(inFilePath, JSON.stringify(featureCollection));

  try {
    const osrmDir = await runShstMatch(inFilePath, outFilePath, flags);

    const matchedFeatures = collectMatchedFeatures(matchedFilePath);

    return { osrmDir, matchedFeatures };
  } catch (err) {
    console.error(err);
    return null;
  } finally {
    cleanup();
  }
};

// Per SharedStreets:
//   "We recommend matching highways and other road types separately for best results."
// See https://sharedstreets.io/getting-started-with-the-sharedstreets-referencing-system/#matching-with-road-classifications
const runMatcher = (features, flags) =>
  match({
    features,
    flags: flags.concat([]),
  });

const updateMatches = (matches, newMatches) => {
  // Will prefer non-osrm-assisted in result set.
  // https://lodash.com/docs/4.17.15#uniqWith
  //   The order of result values is determined by the order they occur in the array.
  const uniqueMatches = _.uniqWith(
    Array.prototype.concat(matches, newMatches).filter((f) => f),
    // Definition of "equivalence"
    (a, b) =>
      // same target_map feature
      a.properties.pp_id === b.properties.pp_id &&
      // same source_map feature id
      a.properties.shstReferenceId === b.properties.shstReferenceId &&
      // same source_map coordinates
      _.isEqual(turf.getCoords(a), turf.getCoords(b))
  );

  // Mutate the original array
  // Clear it
  matches.length = 0;

  // Fill it with the new set union
  matches.push(...uniqueMatches);
};

const updateUnmatched = (unmatched, matches) => {
  const matchesByTargetMapId = Array.isArray(matches)
    ? matches.reduce((acc, shstMatch) => {
        if (shstMatch && shstMatch.geometry.coordinates.length > 1) {
          const {
            properties: { pp_id },
          } = shstMatch;

          acc[pp_id] = acc[pp_id] || [];
          acc[pp_id].push(shstMatch);
        }

        return acc;
      }, {})
    : {};

  const unmatchedFeatures = unmatched.filter((feature) => {
    const {
      properties: { id },
    } = feature;

    const matchesForFeature = matchesByTargetMapId[id] || [];

    const featureLength = turf.length(feature);
    const totalMatchesLength = matchesForFeature.reduce(
      (acc, shstMatch) => acc + turf.length(shstMatch),
      0
    );

    const matchesLenRatio =
      (featureLength - totalMatchesLength) / featureLength;

    return matchesLenRatio >= MATCHES_LENGTH_RATIO_THOLD;
  });

  unmatched.length = 0;

  unmatched.push(...unmatchedFeatures);
};

const shstMatchFeatures = async (features, flags = []) => {
  if (_.isEmpty(features)) {
    return null;
  }

  // if (
  // flags.includes(CAR) ||
  // flags.includes(MOTORWAYS_ONLY) ||
  // flags.includes(SURFACE_STREETS_ONLY)
  // ) {
  // throw new Error(
  // "The matcher attempts all, motorway-only, and surface-streets-only. Flags specifying road types are invalid"
  // );
  // }

  const unmatched = features.slice();
  const matches = [];

  // matching will use car routing rules in OSRM
  const { osrmDir, matchedFeatures: matchedUnassisted = [] } =
    // (await runMatcher(features, flags.concat(CAR))) || {};
    (await runMatcher(features, flags)) || {};

  if (Array.isArray(matchedUnassisted)) {
    matchedUnassisted.forEach((feature) => {
      /* eslint-disable-next-line */
      feature.properties.pp_osrm_assisted = false;
    });
  }

  updateMatches(matches, matchedUnassisted);
  updateUnmatched(unmatched, matches);

  const osrmMethods = [ROUTE, MATCH];
  const lineSliceMethods = [DISTANCE_SLICE_METHOD, BEARING_SLICE_METHOD];

  for (let i = 0; i < osrmMethods.length; ++i) {
    const osrmMethod = osrmMethods[i];

    for (let j = 0; j < lineSliceMethods.length; ++j) {
      const lineSliceMethod = lineSliceMethods[i];

      const osrmMapped = [];

      for (const feature of unmatched) {
        try {
          const mapped = await replaceFeaturesGeomsWithOsrmRoute(
            {
              osrmDir,
              feature,
            },
            { lineSliceMethod, osrmMethod }
          );
          if (mapped) {
            osrmMapped.push(...mapped);
          }
        } catch (err) {
          console.warn(err);
        }
      }

      const { matchedFeatures: matchedOsrmMappedCar } =
        // (await runMatcher(osrmMapped, flags.concat(CAR))) || {};
        (await runMatcher(osrmMapped, flags)) || {};

      if (Array.isArray(matchedOsrmMappedCar)) {
        matchedOsrmMappedCar.forEach((feature) => {
          /* eslint-disable-next-line */
          feature.properties.pp_osrm_assisted = true;
          feature.properties.pp_osrm_method = osrmMethod;
          feature.properties.pp_line_slice_method = lineSliceMethod;
        });
      }

      updateMatches(matches, matchedOsrmMappedCar);
      updateUnmatched(unmatched, matches);
    }
  }

  const idxById = {};
  for (let i = 0; i < matches.length; ++i) {
    const finalMatch = matches[i];
    const {
      properties: { pp_id },
    } = finalMatch;

    const pp_match_index = idxById[pp_id] || 0;

    finalMatch.properties.pp_match_index = pp_match_index;

    idxById[pp_id] = pp_match_index + 1;
  }

  return { osrmDir, matches };
};

module.exports = shstMatchFeatures;
