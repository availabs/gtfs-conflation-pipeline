# AVAIL GTFS Conflation Pipeline

## Instructions

### Install Node dependencies

```bash
npm install
mv ./node_modules/osrm/profiles/car.lua ./node_modules/osrm/profiles/car.lua.default
cp ./src/osrm_profiles/transit-car-based.lua ./node_modules/osrm/profiles/car.lua
```

### View the yargs script help

```bash
./run --help
```

## A Pipeline of Transparent Transformations

The data transformations are broken down into stages.
Each stage's output is written to its own
  SQLite database[¹](https://www.sqlite.org/aff_short.html) [²](https://www.sqlite.org/appfileformat.html).
This combination of decomposition and transparency
  allows inspection and correction of each stages' output
  before proceeding to the next stage.

### Pipeline Stage 1: Load the GTFS data into a SQLite database

```bash
$ ./run load_raw_gtfs_into_sqlite --gtfs_zip data/gtfs/cdta/gtfs.zip --output_dir output/cdta
load raw gtfs: 6208.954ms
```

### Pipeline Stage 2: Transform Raw GTFS to GeoJSON

Transform GTFS shapes to GeoJSON LineStrings and GTFS stops to GeoJSON Points.

```bash
$ ./run gtfs_as_geojson --output_dir output/cdta
load gtfs as geojson: 474.325ms
```

### Pipeline Stage 3: GeoJSON Stops and Shapes to GTFS Network Segments

Outputs GTFS shapes as GeoJSON LineStrings segmented at snapped stops.

```bash
$ ./run gtfs_network --output_dir output/cdta
load gtfs network: 19992.788ms
```

### Pipeline Stage 4: SharedStreets conflation of GTFS Transit Network

Run GTFS transit network through SharedStreets with some assistance.
Outputs conflation results.

```bash
$ ./run gtfs_osm_network --output_dir output/cdta
# ... shst logging ...
load gtfs-osm network: 3284747.261ms
```

## Where to get the data

* [transitfeeds](https://transitfeeds.com/feeds)

## Example Usage

Given the following data directory structure

```bash
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
    ./run gtfs_as_geojson --output_dir="$output_dir"
    ./run gtfs_network --output_dir="$output_dir"
    ./run gtfs_osm_network --output_dir="$output_dir"

    echo;
  done
```

will create the following output directory

```bash
$ tree output
output
├── cdta
│   └── sqlite
│       ├── geojson_gtfs
│       ├── gtfs_network
│       ├── gtfs_osm_network
│       └── raw_gtfs
├── centro
│   └── sqlite
│       ├── geojson_gtfs
│       ├── gtfs_network
│       ├── gtfs_osm_network
│       └── raw_gtfs
├── ja
│   └── sqlite
│       ├── geojson_gtfs
│       ├── gtfs_network
│       ├── gtfs_osm_network
│       └── raw_gtfs
├── mta
│   └── sqlite
│       ├── geojson_gtfs
│       ├── gtfs_network
│       ├── gtfs_osm_network
│       └── raw_gtfs
├── nfta
│   └── sqlite
│       ├── geojson_gtfs
│       ├── gtfs_network
│       ├── gtfs_osm_network
│       └── raw_gtfs
├── nice
│   └── sqlite
│       ├── geojson_gtfs
│       ├── gtfs_network
│       ├── gtfs_osm_network
│       └── raw_gtfs
├── rgrta
│   └── sqlite
│       ├── geojson_gtfs
│       ├── gtfs_network
│       ├── gtfs_osm_network
│       └── raw_gtfs
├── sct
│   └── sqlite
│       ├── geojson_gtfs
│       ├── gtfs_network
│       ├── gtfs_osm_network
│       └── raw_gtfs
└── wcdot
    └── sqlite
        ├── geojson_gtfs
        ├── gtfs_network
        ├── gtfs_osm_network
        └── raw_gtfs
```

where the leaves of the tree are SQLite databases.
