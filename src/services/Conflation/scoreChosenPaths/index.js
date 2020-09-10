const { getFrechetDistance } = require("./frechet");

const score = (S, T) => {
  const frechet = getFrechetDistance(S, T);

  return { frechet };
};

module.exports = score;
