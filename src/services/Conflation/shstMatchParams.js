module.exports = {
  out: {
    type: "string",
    description:
      "file output name creates files [file-output-name].matched.geojson and [file-output-name].unmatched.geojson",
  },
  "tile-source": {
    type: "string",
    description: "SharedStreets tile source",
    default: "osm/planet-181224",
  },
  "tile-hierarchy": {
    type: "integer",
    description: "SharedStreets tile hierarchy",
    default: 6,
  },
  "skip-port-properties": {
    type: "boolean",
    description: 'skip porting existing feature properties preceeded by "pp_"',
    default: false,
  },
  "follow-line-direction": {
    type: "boolean",
    description: "only match using line direction",
    default: false,
  },
  "best-direction": {
    type: "boolean",
    description: "only match one direction based on best score",
    default: false,
  },
  "direction-field": {
    type: "string",
    description:
      'name of optional line properity describing segment directionality, use the related "one-way-*-value" and "two-way-value" properties',
  },
  "one-way-with-direction-value": {
    type: "string",
    description:
      'name of optional value of "direction-field" indicating a one-way street with line direction',
  },
  "one-way-against-direction-value": {
    type: "string",
    description:
      'name of optional value of "direction-field" indicating a one-way street against line direction',
  },
  "two-way-value": {
    type: "string",
    description:
      'name of optional value of "direction-field" indicating a two-way street',
  },
  "bearing-field": {
    type: "string",
    description:
      "name of optional point property containing bearing in decimal degrees",
    default: "bearing",
  },
  "search-radius": {
    type: "integer",
    description:
      "search radius for for snapping points, lines and traces (in meters)",
    default: 10,
  },
  "snap-intersections": {
    type: "boolean",
    description:
      "snap line end-points to nearest intersection if closer than distance defined by snap-intersections-radius ",
    default: false,
  },
  "snap-intersections-radius": {
    type: "integer",
    description:
      "snap radius for intersections (in meters) used when snap-intersections is set",
    default: 10,
  },
  "snap-side-of-street": {
    type: "boolean",
    description: "snap line to side of street",
    default: false,
  },
  "side-of-street-field": {
    type: "string",
    description:
      "name of optional property defining side of street relative to direction of travel",
  },
  "right-side-of-street-value": {
    type: "string",
    description: 'value of "side-of-street-field" for right side features',
    default: "right",
  },
  "left-side-of-street-value": {
    type: "string",
    description: 'value of "side-of-street-field" for left side features',
    default: "left",
  },
  "center-of-street-value": {
    type: "string",
    description: 'value of "side-of-street-field" for center features',
    default: "center",
  },
  "left-side-driving": {
    type: "boolean",
    description: "snap line to side of street using left-side driving rules",
    default: false,
  },
  "match-car": {
    type: "boolean",
    description: "match using car routing rules",
    default: true,
  },
  "match-bike": {
    type: "boolean",
    description: "match using bike routing rules",
    default: false,
  },
  "match-pedestrian": {
    type: "boolean",
    description: "match using pedestrian routing rules",
    default: false,
  },
  "match-motorway-only": {
    type: "boolean",
    description: "only match against motorway segments",
    default: false,
  },
  "match-surface-streets-only": {
    type: "boolean",
    description: "only match against surface street segments",
    default: false,
  },
  "offset-line": {
    type: "integer",
    description:
      "offset geometry based on direction of matched line (in meters)",
  },
  "cluster-points": {
    type: "integer",
    description:
      "aproximate sub-segment length for clustering points (in meters)",
  },
  "buffer-points": {
    type: "boolean",
    description: "buffer points into segment-snapped line segments",
  },
  "buffer-points-length": {
    type: "integer",
    description: "length of buffered point (in meters)",
    default: 5,
  },
  "buffer-points-length-field": {
    type: "string",
    description: "name of property containing buffered points (in meters)",
    default: "length",
  },
  "buffer-merge": {
    type: "boolean",
    description:
      "merge buffered points -- requires related buffer-merge-match-fields to be defined",
    default: false,
  },
  "buffer-merge-match-fields": {
    type: "string",
    description:
      "comma seperated list of fields to match values when merging buffered points",
    default: "",
  },
  "buffer-merge-group-fields": {
    type: "string",
    description:
      "comma seperated list of fields to group values when merging buffered points",
    default: "",
  },
  "join-points": {
    type: "boolean",
    description:
      "joins points into segment-snapped line segments -- requires related join-points-match-fields to be defined",
  },
  "join-points-match-fields": {
    type: "string",
    description:
      "comma seperated list of fields to match values when joining points",
    default: "",
  },
  "join-point-sequence-field": {
    type: "string",
    description:
      "name of field containing point sequence (e.g. 1=start, 2=middle, 3=terminus)",
    default: "point_sequence",
  },
  "trim-intersections-radius": {
    type: "integer",
    description:
      "buffer and clip radius for intersections in point buffer and point join operations (in meters)",
    default: 0,
  },
};
