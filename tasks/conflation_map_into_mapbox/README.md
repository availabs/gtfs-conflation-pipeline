# Create QA mbtiles

## Instructions

The RIS/NPMRDS/OSM conflation process creates a _conflation\_map_ SQLite database.
Put that database (or a soft-link to it) in the _./base\_data_ directory.

```bash
./bin/dumpConflationMapDatabaseToNDGeoJSON
./bin/createMBTilesNDGeoJSON
```

Output written to _./derived\_data_.

```bash
$ tree derived_data
derived_data
├── gtfs_qa_conflation_map.mbtiles
└── gtfs_qa_conflation_map.ndjson
```
