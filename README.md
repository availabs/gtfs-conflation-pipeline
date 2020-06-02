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
agency.txt: 20.685ms
calendar.txt: 23.862ms
calendar_dates.txt: 50.556ms
fare_attributes.txt: 16.357ms
fare_rules.txt: 29.759ms
feed_info.txt: 20.642ms
routes.txt: 45.390ms
shapes.txt: 1138.103ms
stop_times.txt: 5096.418ms
stops.txt: 83.641ms
trips.txt: 207.345ms
Load GTFS: 6768.442ms
```

### Pipeline Step 2: Transform to GeoJSON

Transform GTFS shapes to GeoJSON LineStrings and GTFS stops to GeoJSON Points.

```
./run gtfs_as_geojson --output_dir output/cdta
loadStops
stops: 58.662ms
shapes: 427.291ms
```

### Where to get the data

* [transitfeeds](https://transitfeeds.com/feeds)
