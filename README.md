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

## A Pipeline of Transparent Transformations

The data transformations are broken down into stages.
Each stage's output is written to its own SQLite database.
This combination of decomposition and transparency
  allows inspection and correction of each stages' output
  before proceeding to the next stage.

### Pipeline Stage 1: Load the GTFS data into a SQLite database

```
$ ./run load_raw_gtfs_into_sqlite --gtfs_zip data/gtfs/cdta/gtfs.zip --output_dir output/cdta
load raw gtfs: 6208.954ms
```

### Pipeline Stage 2: Transform Raw GTFS to GeoJSON

Transform GTFS shapes to GeoJSON LineStrings and GTFS stops to GeoJSON Points.

```
$ ./run gtfs_as_geojson --output_dir output/cdta
load gtfs as geojson: 474.325ms
```

### Pipeline Stage 3: GeoJSON Stops and Shapes to GTFS Network Segments

Outputs GTFS shapes as GeoJSON LineStrings segmented at snapped stops.

```
$ ./run gtfs_network --output_dir output/cdta
load gtfs network: 19992.788ms
```

## Where to get the data

* [transitfeeds](https://transitfeeds.com/feeds)

## Example Usage

Given the following data directory structure
```
$ tree data/gtfs
data/gtfs
├── cdta
│   └── gtfs.zip
├── centro
│   └── gtfs.zip
├── ja
│   └── gtfs.zip
├── mta
│   └── gtfs.zip
├── nfta
│   └── gtfs.zip
├── nice
│   └── gtfs.zip
├── rgrta
│   └── gtfs.zip
├── sct
│   └── gtfs.zip
└── wcdot
    └── gtfs.zip
```

Running the following
```bash
find data/gtfs -mindepth 1 -type d |
  sort |
  while read -r dir; do
    output_dir="output/$( basename "$dir" )"

    echo "$dir";

    ./run load_raw_gtfs_into_sqlite --gtfs_zip="${dir}/gtfs.zip" --output_dir="$output_dir"
    ./run gtfs_as_geojson  --output_dir="$output_dir"
    ./run gtfs_network  --output_dir="$output_dir"

    echo;
  done
```

Will log the following
```
data/gtfs/cdta
load raw gtfs: 6208.954ms
load gtfs as geojson: 474.325ms
load gtfs network: 19992.788ms

data/gtfs/centro
load raw gtfs: 13700.215ms
load gtfs as geojson: 1390.829ms
load gtfs network: 91693.674ms

data/gtfs/ja
load raw gtfs: 144.662ms
load gtfs as geojson: 13.922ms
load gtfs network: 50.231ms

data/gtfs/mta
load raw gtfs: 17981.274ms
load gtfs as geojson: 171.327ms
load gtfs network: 23627.722ms

data/gtfs/nfta
load raw gtfs: 6372.376ms
load gtfs as geojson: 651.678ms
load gtfs network: 42386.814ms

data/gtfs/nice
load raw gtfs: 5374.420ms
load gtfs as geojson: 276.974ms
load gtfs network: 18132.305ms

data/gtfs/rgrta
load raw gtfs: 4989.529ms
load gtfs as geojson: 902.558ms
load gtfs network: 35279.522ms

data/gtfs/sct
load raw gtfs: 4871.987ms
load gtfs as geojson: 741.701ms
load gtfs network: 44535.106ms

data/gtfs/wcdot
load raw gtfs: 8308.754ms
load gtfs as geojson: 935.978ms
load gtfs network: 55785.278ms
```

And create the following output directory
```
$ tree output
output
├── cdta
│   └── sqlite
│       ├── geojson_gtfs
│       ├── gtfs_network
│       └── raw_gtfs
├── centro
│   └── sqlite
│       ├── geojson_gtfs
│       ├── gtfs_network
│       └── raw_gtfs
├── ja
│   └── sqlite
│       ├── geojson_gtfs
│       ├── gtfs_network
│       └── raw_gtfs
├── mta
│   └── sqlite
│       ├── geojson_gtfs
│       ├── gtfs_network
│       └── raw_gtfs
├── nfta
│   └── sqlite
│       ├── geojson_gtfs
│       ├── gtfs_network
│       └── raw_gtfs
├── nice
│   └── sqlite
│       ├── geojson_gtfs
│       ├── gtfs_network
│       └── raw_gtfs
├── rgrta
│   └── sqlite
│       ├── geojson_gtfs
│       ├── gtfs_network
│       └── raw_gtfs
├── sct
│   └── sqlite
│       ├── geojson_gtfs
│       ├── gtfs_network
│       └── raw_gtfs
└── wcdot
    └── sqlite
        ├── geojson_gtfs
        ├── gtfs_network
        └── raw_gtfs
```
