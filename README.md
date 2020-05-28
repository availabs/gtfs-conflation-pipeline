# AVAIL GTFS Conflation Tool

## Instructions

```
sudo apt-get install sqlite3
npm install
./run --help
```

## Example

```
./run load_raw_gtfs_into_sqlite --gtfs_zip data/gtfs/mta/gtfs.zip --sqlite_dir loaded_gtfs/mta  
agency: 13.276ms
calendar: 12.731ms
calendar_dates: 31.675ms
stops: 102.236ms
trips: 769.271ms
stop_times: 18890.963ms
shapes: 503.611ms
routes: 17.371ms
Load GTFS: 20412.090ms
```
