# AVAIL GTFS Conflation Pipeline

## Instructions

### Install Node dependencies
```
npm install
```

### View the yargs script help.
```
./run --help
```

## Example

### Pipeline Step 1: Load the GTFS data into a SQLite database

```
./run load_raw_gtfs_into_sqlite --gtfs_zip data/gtfs/cdta/gtfs.zip --output_dir output/cdta
load raw gtfs: 6208.954ms
```

### Pipeline Step 2: Transform Raw GTFS to GeoJSON

Transform GTFS shapes to GeoJSON LineStrings and GTFS stops to GeoJSON Points.

```
./run gtfs_as_geojson --output_dir output/cdta
load gtfs as geojson: 474.325ms
```

### Pipeline Stage 3: GeoJSON Stops and Shapes to GTFS Network Segments

Outputs GTFS shapes as GeoJSON LineStrings segmented at snapped stops.

```
./run gtfs_network --output_dir output/cdta
load gtfs network: 19992.788ms
```

## Where to get the data

* [transitfeeds](https://transitfeeds.com/feeds)
