module.exports = {
  error: console.error.bind(console),
  warn: console.warn.bind(console),
  info: console.info.bind(console),
  verbose: console.log.bind(console),
  debug: console.log.bind(console),
  silly: console.log.bind(console),
  time: console.time.bind(console),
  timeEnd: console.timeEnd.bind(console)
};
