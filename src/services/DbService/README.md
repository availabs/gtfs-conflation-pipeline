# SQLite

[SQLite As An Application File Format](https://www.sqlite.org/appfileformat.html)

## Using unsafe mode for sync loading with better-sqlite3

The problem is iterating over earlier pipeline stage output
  while writing current pipeline stage output.

See:

* [Executing other queries while iterating through a SELECT statement](https://github.com/JoshuaWise/better-sqlite3/issues/203)
* [Unsafe mode](https://github.com/JoshuaWise/better-sqlite3/blob/master/docs/unsafe.md)

[Using sqlite3_update_hook](https://github.com/JoshuaWise/better-sqlite3/issues/62)

## Creating separate loading connection for async loading with better-sqlite3

To preserve isolation, we need to lock the database.
We can do this by creating a separate connection.

* [[Request] add streaming support](https://github.com/JoshuaWise/better-sqlite3/issues/241)

* [The Geopoly Interface To The SQLite R*Tree Module](https://www.sqlite.org/geopoly.html)

> The Geopoly module is an alternative interface to the R-Tree extension that
> uses the GeoJSON notation (RFC-7946) to describe two-dimensional polygons.
> Geopoly includes functions for detecting when one polygon is contained
> within or overlaps with another, for computing the area enclosed by a
> polygon, for doing linear transformations of polygons, for rendering
> polygons as SVG, and other similar operations.

## SpatiaLite

[configurable extension 'entry point' #363](https://github.com/JoshuaWise/better-sqlite3/issues/363)
[loadExtension: allow specifying extension entry point #364](https://github.com/JoshuaWise/better-sqlite3/pull/364)
