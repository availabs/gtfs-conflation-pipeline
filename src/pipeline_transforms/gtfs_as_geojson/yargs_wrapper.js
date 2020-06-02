#!/usr/bin/env node

const main = require('./index');

const command = 'gtfs_as_geojson';
const desc = 'Load the GTFS files into a SQLite Database.';

const handler = main;

module.exports = {
  command,
  desc,
  handler
};
