## Using unsafe mode for sync loading with better-sqlite3

The problem is iterating over earlier pipeline stage output while writing current pipeline stage output.

See:
  * [Executing other queries while iterating through a SELECT statement](https://github.com/JoshuaWise/better-sqlite3/issues/203)
  * [Unsafe mode](https://github.com/JoshuaWise/better-sqlite3/blob/master/docs/unsafe.md)

## Creating separate loading connection for async loading with better-sqlite3

To preserve isolation, we need to lock the database. We can do this by creating a separate connection.

  * [[Request] add streaming support](https://github.com/JoshuaWise/better-sqlite3/issues/241)
