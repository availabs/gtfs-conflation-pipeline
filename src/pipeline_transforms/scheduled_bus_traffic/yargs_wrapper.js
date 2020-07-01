const main = require("./index");

const command = "scheduled_bus_traffic";
const desc = "Load the scheduled bus traffic.";

const handler = main;

module.exports = {
  command,
  desc,
  handler
};
