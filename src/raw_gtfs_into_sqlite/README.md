# Loading GTFS files into SQLite

## Design Decisions

### Dependency of SQLite installed on the host machine

The following explains why I chose to add SQLite on the host as a dependency. 

I tried to use insert the data into SQLite using the Node library
[better-sqlite3](https://github.com/JoshuaWise/better-sqlite3).
I chose _better-sqlite3_ because it is syncronous and simplifies the codebase.
It is also fast enough for most tasks.

However, for this task, the performance was very poor.

```
time ./run raw_gtfs_into_sqlite --gtfs_dir data/gtfs/cdta --sqlite_dir foo
agency.txt: 9.754ms
calendar.txt: 222.471ms
fare_attributes.txt: 580.072ms
fare_rules.txt: 926.911ms
feed_info.txt: 566.602ms
calendar_dates.txt: 6637.520ms
routes.txt: 331.396ms
shapes.txt: 672583.469ms
stop_times.txt: 1993530.997ms
stops.txt: 47098.608ms
trips.txt: 73058.990ms
done
./run raw_gtfs_into_sqlite --gtfs_dir data/gtfs/cdta --sqlite_dir foo  89.92s user 243.43s system 12% cpu 45:14.46 total
```


The other major Node SQLite library is mapbox's [node-sqlite3](https://github.com/mapbox/node-sqlite3).
It doesn't appear to offer good support for bulk inserts either.

Using the [SQLite CLI](https://sqlite.org/cli.html) to load the data was fast.

```
time ./run raw_gtfs_into_sqlite --gtfs_dir data/gtfs/cdta --sqlite_dir foo
agency: 13.316ms
calendar: 19.829ms
calendar_dates: 61.799ms
fare_attributes: 7.791ms
fare_rules: 9.989ms
feed_info: 7.904ms
routes: 50.161ms
shapes: 1477.213ms
stop_times: 5685.417ms
stops: 112.311ms
trips: 193.505ms
Load GTFS: 7730.848ms
./run raw_gtfs_into_sqlite --gtfs_dir data/gtfs/cdta --sqlite_dir foo  10.79s user 3.14s system 176% cpu 7.910 total
```

I didn't put much time into optimizing the _better-sqlite3_ bulk loading.
If time permits, that might be worthwhile.
However, it seems very unlikely that the performance can be brought close to the native _sqlite3_ performance.
I expect having to load numerous historical GTFS files for numerous agencies, so speed matters.
