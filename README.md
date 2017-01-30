# cache-service-file-system

A cache-service module that provides caching via the local file system.

Currently compatible with cache-service 1.3.

# Basic Usage

Require and instantiate:

```javascript
const FsCache = require('cache-service-file-system');

var fsCache = new FsCache({
    cacheRoot: './cache'    // evaluated relative to working directory
});
```

Cache!

```javascript
fsCache.set('key', 'value');
```

# Configuration Options

`cache-service-file-system`'s constructor takes an optional config object with
any number of the following properties:

## cacheRoot

A path to the root file-system directory to use for cached data.

* type: string
* default: './cache' (relative to working directory)

## pathify

A function to customize mapping the key to a relative cache path.  The default
implementation takes a key like "abc123def" and returns the path
"ab/c1/23/de/abc123def.json", which works reasonably well for relatively short
keys.  You can provide a `pathify` implementation for cases where you can't
control the key directly, but need to ensure valid and short cache paths.  For
example,
[superagent-cache-plugin](https://github.com/jpodwys/superagent-cache-plugin)
simply `JSON.stringify()`'s several values as a key.  For a more compact/dense
cache, you can return a hash of this value.

* type: function
* default: (creates a subdirectory for every two characters in the key)


## readOnly

Whether the cache is read-only or not.

* type: boolean
* default: false

## verbose

> When used with `cache-service`, this property is overridden by `cache-service`'s `verbose` value.

When false, `cache-service-file-system` will log only errors. When true,
`cache-service-file-system` will log all activity (useful for testing and
debugging).

* type: boolean
* default: false

## type

A name used for diagnostics/logs, to disambiguate between multiple instances.

* type: string
* default: 'file-system'
