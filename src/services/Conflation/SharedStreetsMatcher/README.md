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

## SharedStreets Reference section[x, y]

QUESTION:
What do the x & y represent?

I had assumed they were the start and end distances along.
However, in some cases x > y.

ANSWER:
Happens for extremely short geometries (longest observed case < 1/2 foot).
