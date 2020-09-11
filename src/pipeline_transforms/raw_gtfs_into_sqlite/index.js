/* eslint-disable no-await-in-loop */

const { copyFileSync } = require("fs");
const { join } = require("path");
const { pipeline } = require("stream");

const unzipper = require("unzipper");
const csv = require("fast-csv");

const dao = require("../../daos/RawGtfsDAO");

const timerId = "load raw gtfs";

const main = async ({ gtfs_zip, output_dir }) => {
  try {
    console.time(timerId);

    const { files: zipEntries } = await unzipper.Open.file(gtfs_zip);

    for (let i = 0; i < zipEntries.length; ++i) {
      const zipEntry = zipEntries[i];

      const { path: fileName } = zipEntry;

      // Convert the CSV to an Object stream
      const csvParseStream = csv.parse({
        headers: true,
      });

      const rowAsyncIterator = pipeline(zipEntry.stream(), csvParseStream);

      const rowCt = await dao.loadAsync(fileName, rowAsyncIterator);

      if (rowCt === null) {
        console.warn(`No table created for ${fileName}.`);
      }
    }

    const zipArchiveCopyPath = join(output_dir, "gtfs.zip");

    if (gtfs_zip !== zipArchiveCopyPath) {
      copyFileSync(gtfs_zip, zipArchiveCopyPath);
    }

    console.timeEnd(timerId);
  } catch (err) {
    if (err.message === "database is locked") {
      console.error(
        "ERROR: The GTFS file loader must have exclusive access to the database."
      );
    }

    console.error(err);
    process.exit(1);
  }
};

module.exports = main;
