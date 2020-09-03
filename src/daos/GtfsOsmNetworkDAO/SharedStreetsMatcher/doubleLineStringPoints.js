const turf = require("@turf/turf");

const doubleLineStringPoints = feature => {
  const { features: explodedPoints } = turf.explode(feature);

  const [[startLon, startLat]] = turf.getCoords(feature.geometry.coordinates);

  const enhancedCoords = explodedPoints.slice(1).reduce(
    (acc, pt, i) => {
      const prevPt = explodedPoints[i];

      const {
        geometry: { coordinates: midPtCoords }
      } = turf.midpoint(pt, prevPt);

      const {
        geometry: { coordinates: curPtCoords }
      } = pt;

      acc.push(midPtCoords);
      acc.push(curPtCoords);

      return acc;
    },
    [[startLon, startLat]]
  );

  return turf.lineString(enhancedCoords, feature.properties, {
    id: feature.id
  });
};

module.exports = doubleLineStringPoints;
