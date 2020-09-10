const flags = {};

const foo = {
  help: flags.help({ char: "h" }),

  // flag with a value (-o, --out=FILE)
  out: flags.string({
    char: "o",
    description:
      "file output name creates files [file-output-name].matched.geojson and [file-output-name].unmatched.geojson",
  }),
  "tile-source": flags.string({
    description: "SharedStreets tile source",
    default: "osm/planet-181224",
  }),
  "tile-hierarchy": flags.integer({
    description: "SharedStreets tile hierarchy",
    default: 6,
  }),
  "skip-port-properties": flags.boolean({
    char: "p",
    description: 'skip porting existing feature properties preceeded by "pp_"',
    default: false,
  }),
  "follow-line-direction": flags.boolean({
    description: "only match using line direction",
    default: false,
  }),
  "best-direction": flags.boolean({
    description: "only match one direction based on best score",
    default: false,
  }),
  "direction-field": flags.string({
    description:
      'name of optional line properity describing segment directionality, use the related "one-way-*-value" and "two-way-value" properties',
  }),
  "one-way-with-direction-value": flags.string({
    description:
      'name of optional value of "direction-field" indicating a one-way street with line direction',
  }),
  "one-way-against-direction-value": flags.string({
    description:
      'name of optional value of "direction-field" indicating a one-way street against line direction',
  }),
  "two-way-value": flags.string({
    description:
      'name of optional value of "direction-field" indicating a two-way street',
  }),
  "bearing-field": flags.string({
    description:
      "name of optional point property containing bearing in decimal degrees",
    default: "bearing",
  }),
  "search-radius": flags.integer({
    description:
      "search radius for for snapping points, lines and traces (in meters)",
    default: 10,
  }),
  "snap-intersections": flags.boolean({
    description:
      "snap line end-points to nearest intersection if closer than distance defined by snap-intersections-radius ",
    default: false,
  }),
  "snap-intersections-radius": flags.integer({
    description:
      "snap radius for intersections (in meters) used when snap-intersections is set",
    default: 10,
  }),

  "snap-side-of-street": flags.boolean({
    description: "snap line to side of street",
    default: false,
  }),
  "side-of-street-field": flags.string({
    description:
      "name of optional property defining side of street relative to direction of travel",
  }),
  "right-side-of-street-value": flags.string({
    description: 'value of "side-of-street-field" for right side features',
    default: "right",
  }),
  "left-side-of-street-value": flags.string({
    description: 'value of "side-of-street-field" for left side features',
    default: "left",
  }),
  "center-of-street-value": flags.string({
    description: 'value of "side-of-street-field" for center features',
    default: "center",
  }),
  "left-side-driving": flags.boolean({
    description: "snap line to side of street using left-side driving rules",
    default: false,
  }),
  "match-car": flags.boolean({
    description: "match using car routing rules",
    default: true,
  }),
  "match-bike": flags.boolean({
    description: "match using bike routing rules",
    default: false,
  }),
  "match-pedestrian": flags.boolean({
    description: "match using pedestrian routing rules",
    default: false,
  }),
  "match-motorway-only": flags.boolean({
    description: "only match against motorway segments",
    default: false,
  }),
  "match-surface-streets-only": flags.boolean({
    description: "only match against surface street segments",
    default: false,
  }),
  "offset-line": flags.integer({
    description:
      "offset geometry based on direction of matched line (in meters)",
  }),
  "cluster-points": flags.integer({
    description:
      "aproximate sub-segment length for clustering points (in meters)",
  }),

  "buffer-points": flags.boolean({
    description: "buffer points into segment-snapped line segments",
  }),
  "buffer-points-length": flags.integer({
    description: "length of buffered point (in meters)",
    default: 5,
  }),
  "buffer-points-length-field": flags.string({
    description: "name of property containing buffered points (in meters)",
    default: "length",
  }),
  "buffer-merge": flags.boolean({
    description:
      "merge buffered points -- requires related buffer-merge-match-fields to be defined",
    default: false,
  }),
  "buffer-merge-match-fields": flags.string({
    description:
      "comma seperated list of fields to match values when merging buffered points",
    default: "",
  }),
  "buffer-merge-group-fields": flags.string({
    description:
      "comma seperated list of fields to group values when merging buffered points",
    default: "",
  }),

  "join-points": flags.boolean({
    description:
      "joins points into segment-snapped line segments -- requires related join-points-match-fields to be defined",
  }),
  "join-points-match-fields": flags.string({
    description:
      "comma seperated list of fields to match values when joining points",
    default: "",
  }),
  "join-point-sequence-field": flags.string({
    description:
      "name of field containing point sequence (e.g. 1=start, 2=middle, 3=terminus)",
    default: "point_sequence",
  }),

  "trim-intersections-radius": flags.integer({
    description:
      "buffer and clip radius for intersections in point buffer and point join operations (in meters)",
    default: 0,
  }),
};
