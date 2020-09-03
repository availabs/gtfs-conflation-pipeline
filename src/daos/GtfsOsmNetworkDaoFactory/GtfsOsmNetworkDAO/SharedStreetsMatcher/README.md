# Matching Methods To Consider

## OSRM -> OSM Nodes

The SharedStreets tiles have OSM metadata.
The ConflationMap segments incorporate that metadata

```JSON
  "osmMetadata": {
    "waySection": {
      "nodeIds": [
        "213428847",
        "213428851",
        "213428855",
        "213428859",
        "213428863"
      ]
    }
  }
```

If we use OSRM to get the OSRM nodes for a GTFS Shape Segment,
  we can then JOIN it to ShstRefs and/or ConflationMap segments.
