/* eslint-disable no-await-in-loop, no-continue */

const { exec } = require('child_process');

const unzipper = require('unzipper');
const csv = require('fast-csv');
const { pipe } = require('mississippi');

const logger = require('../services/logger');

const loadGtfsFile = (db_service, tableName, zipEntry) =>
  new Promise((resolve, reject) => {
    try {
      db_service.createTable(tableName);

      const columnsList = db_service.listColumnsForTable(tableName);

      const sqliteFilePath = db_service.getSqliteFilePath();

      // https://stackoverflow.com/a/39152519/3970755
      const batchLoadCmd = `sh -c 'cat | sqlite3 -csv ${sqliteFilePath} ".import /dev/stdin ${tableName}"'`;

      // Convert the CSV to an Object stream
      const csvParseStream = csv.parse({
        headers: true
      });

      // Output a CSV stream with the supported cols in the proper order
      const csvFormatStream = csv.format({
        headers: columnsList,
        writeHeaders: false
      });

      logger.time(tableName);
      const loadProcess = exec(batchLoadCmd);

      loadProcess.stdout.pipe(process.stdout);
      loadProcess.stderr.pipe(process.stderr);

      loadProcess.on('error', err => reject(err));

      loadProcess.on('exit', (code, signal) => {
        logger.timeEnd(tableName);
        if (code) {
          return reject(new Error(`Loader exited with code ${code}`));
        }

        if (signal) {
          return reject(new Error(`Loader exited with signal ${signal}`));
        }

        return resolve();
      });

      return pipe(
        zipEntry.stream(),
        csvParseStream,
        csvFormatStream,
        loadProcess.stdin,
        err => {
          if (err) {
            reject(err);
          }
        }
      );
    } catch (err) {
      return reject(err);
    }
  });

const loadGtfsZip = async (db_service, gtfsZipPath) => {
  const { files: zipEntries } = await unzipper.Open.file(gtfsZipPath);

  for (let i = 0; i < zipEntries.length; ++i) {
    const zipEntry = zipEntries[i];

    const { path: fileName } = zipEntry;

    const tableName = db_service.getTableNameForGtfsFileName(fileName);

    if (!tableName) {
      // not a supported table
      continue;
    }

    try {
      await loadGtfsFile(db_service, tableName, zipEntry);
    } catch (err) {
      logger.error(err);
      db_service.dropTable(tableName);
      process.exit(1);
    }
  }
};

module.exports = loadGtfsZip;
