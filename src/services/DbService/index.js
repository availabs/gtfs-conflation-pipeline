const { sync: mkdirpSync } = require("mkdirp");

const Database = require("better-sqlite3");

const { join, isAbsolute } = require("path");

const memoizeOne = require("memoize-one");

const IN_MEMORY = ":memory:";

// Needs to run after module is loaded so "main" has a chance to set.
const getSqliteDir = memoizeOne(() => {
  const { AVL_GTFS_CONFLATION_OUTPUT_DIR } = process.env;

  if (!AVL_GTFS_CONFLATION_OUTPUT_DIR) {
    console.error("The AVL_GTFS_CONFLATION_OUTPUT_DIR ENV must be set.");
    console.error(
      'It is the responsibility of any "main" module to ensure that it is set.'
    );
    process.exit(1);
  }

  const sqliteDir = isAbsolute(AVL_GTFS_CONFLATION_OUTPUT_DIR)
    ? join(AVL_GTFS_CONFLATION_OUTPUT_DIR, "sqlite")
    : join(process.cwd(), AVL_GTFS_CONFLATION_OUTPUT_DIR, "sqlite");

  mkdirpSync(sqliteDir);

  return sqliteDir;
});

const db = new Database(IN_MEMORY);

const getDatabaseFilePathForSchemaName = databaseSchemaName =>
  join(getSqliteDir(), databaseSchemaName);

const openLoadingConnectionToDb = databaseSchemaName => {
  const databaseFilePath = getDatabaseFilePathForSchemaName(databaseSchemaName);

  const xdb = new Database(IN_MEMORY);

  xdb.exec(`ATTACH DATABASE '${databaseFilePath}' AS ${databaseSchemaName};`);

  return xdb;
};

const closeLoadingConnectionToDb = xdb => {
  xdb.close();
};

const attachedDatabases = new Set();

const attachDatabase = databaseSchemaName => {
  if (attachedDatabases.has(databaseSchemaName)) {
    return;
  }

  const databaseFilePath = join(getSqliteDir(), databaseSchemaName);

  db.exec(`ATTACH DATABASE '${databaseFilePath}' AS ${databaseSchemaName};`);

  attachedDatabases.add(databaseSchemaName);
};

// Prepared statements are memoized
const preparedStmts = {};

// Idempotent
const prepare = sql => {
  if (preparedStmts[sql]) {
    return preparedStmts[sql];
  }

  const stmt = db.prepare(sql);

  // https://stackoverflow.com/a/28841863/3970755
  preparedStmts[sql] = stmt;
  return stmt;
};

// Can bind more db methods if they are needed.
//   https://github.com/JoshuaWise/better-sqlite3/blob/master/docs/api.md
module.exports = {
  attachDatabase,
  prepare,
  exec: db.exec.bind(db),
  transaction: db.transaction.bind(db),
  openLoadingConnectionToDb,
  closeLoadingConnectionToDb,
  unsafeMode: db.unsafeMode.bind(db)
};
