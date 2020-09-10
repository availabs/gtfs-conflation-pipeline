#!/usr/bin/env node

const { Semaphore } = require("await-semaphore");

const semaphore = new Semaphore(1);

const shstMatchFeatures = require("./SharedStreetsMatcher/shstMatchFeatures");

process.on("message", async ({ id, features, flags }) => {
  const release = await semaphore.acquire();
  console.log("MESSAGE");

  const { matches } = await shstMatchFeatures(features, flags);

  release();

  process.send({ id, matches });
});
