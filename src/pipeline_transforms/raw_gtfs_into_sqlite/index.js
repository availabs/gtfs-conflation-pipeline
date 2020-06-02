/* eslint-disable no-await-in-loop */

const { pipeline } = require('stream');

const unzipper = require('unzipper');
const csv = require('fast-csv');

const logger = require('../../services/Logger');

const RawGtfsDAO = require('../../daos/RawGtfsDAOFactory');

const main = async ({ gtfs_zip }) => {
  try {
    const db_service = RawGtfsDAO.getDAO();

    logger.time('Load GTFS');

    const { files: zipEntries } = await unzipper.Open.file(gtfs_zip);

    for (let i = 0; i < zipEntries.length; ++i) {
      const zipEntry = zipEntries[i];

      const { path: fileName } = zipEntry;

      // Convert the CSV to an Object stream
      const csvParseStream = csv.parse({
        headers: true
      });

      const rowAsyncIterator = pipeline(zipEntry.stream(), csvParseStream);

      logger.time(fileName);

      const rowCt = await db_service.loadAsync(fileName, rowAsyncIterator, {
        clean: true
      });

      if (rowCt === null) {
        logger.warn(`No table created for ${fileName}.`);
      }

      logger.timeEnd(fileName);
    }

    logger.timeEnd('Load GTFS');
  } catch (err) {
    if (err.message === 'database is locked') {
      console.error(
        'ERROR: The GTFS file loader must have exclusive access to the database.'
      );
    }

    logger.error(err);
    process.exit(1);
  }
};

module.exports = main;
