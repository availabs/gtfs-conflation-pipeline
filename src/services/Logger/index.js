const { mkdirSync } = require("fs");
const { join } = require("path");

const winston = require("winston");

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
  console.error(`
ERROR: Invalid logging level ${level}
The valid levels are ${validLevels}
`);
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

console.log(filename);

const logger = winston.createLogger({
  level: AVL_GTFS_CONFLATION_LOGGING_LEVEL,
  format: winston.format.json(),
  // transports: [new winston.transports.File({ filename: "foo.log" })],
  transports: [
    new winston.transports.File({
      format: winston.format.json(),
      filename,
    }),
    // new winston.transports.Console({
    // level: "info",
    // format: winston.format.combine(
    // winston.format.colorize(),
    // winston.format.simple()
    // ),
    // }),
  ],
});

// console.log("What?");
// logger.log({ level: "error", message: "foo" });
// logger.error("foo");

module.exports = logger;

// module.exports = {
// error: console.error.bind(console),
// warn: console.warn.bind(console),
// info: console.info.bind(console),
// verbose: console.log.bind(console),
// debug: console.log.bind(console),
// silly: console.log.bind(console),
// time: console.time.bind(console),
// timeEnd: console.timeEnd.bind(console),
// };
