/* eslint-disable global-require */

const command = "scheduled_bus_traffic";
const desc = "Load the scheduled bus traffic.";

module.exports = {
  command,
  desc,
  handler: (...args) => require("./index")(...args),
};
