const { mkdirSync, statSync, unlinkSync } = require("fs");
const { join } = require("path");

const Winston = require("winston");

const validLevels = [
  "error",
  "warn",
  "info",
  "http",
  "verbose",
  "debug",
  "silly",
];

const {
  AVL_GTFS_CONFLATION_COMMAND = "",
  AVL_GTFS_CONFLATION_LOGGING_LEVEL = "info",
  AVL_GTFS_CONFLATION_OUTPUT_DIR = process.cwd(),
} = process.env;

const level = AVL_GTFS_CONFLATION_LOGGING_LEVEL.toLowerCase();

if (!validLevels.includes(level)) {
  console.error(`ERROR: Invalid logging level ${level}
    The valid levels are (${validLevels})`);
}

const timestamp = new Date()
  .toISOString()
  .replace(/\..*/g, "")
  .replace(/[^0-9T]/g, "");

const logsDir = join(AVL_GTFS_CONFLATION_OUTPUT_DIR, "logs");

mkdirSync(logsDir, { recursive: true });

const basename = AVL_GTFS_CONFLATION_COMMAND
  ? `${AVL_GTFS_CONFLATION_COMMAND}.${timestamp}`
  : timestamp;

const filename = join(logsDir, basename);

const logger = Winston.createLogger({
  level: AVL_GTFS_CONFLATION_LOGGING_LEVEL,
  format: Winston.format.json(),
  // transports: [new Winston.transports.File({ filename: "foo.log" })],
  transports: [
    new Winston.transports.File({
      format: Winston.format.json(),
      filename,
    }),
  ],
});

// If nothing logged to the log file, delete it.
process.on("exit", () => {
  const { size } = statSync(filename);
  if (size === 0) {
    unlinkSync(filename);
    console.error("deleted empty logfile.");
  }
});

logger.on("error", (err) => {
  console.error(err);
  process.exit(1);
});

module.exports = logger;
