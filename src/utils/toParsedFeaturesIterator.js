/* eslint-disable no-restricted-syntax */

/**
 * Transforms the results of a better-sqlite3 raw iterator query of
 *   stringified GeoJSON Features into an iterator of parsed GeoJSON Features.
 *
 * @param {symbol.iterator} iter Iterator over stringified features,
 *    each the first elem of an array. I.E.: [[f1], [f2]].
 */
function* toParsedFeaturesIterator(iter) {
  for (const [feature] of iter) {
    yield JSON.parse(feature);
  }
}

module.exports = toParsedFeaturesIterator;
