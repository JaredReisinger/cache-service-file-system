# cache-service-file-system

A cache-service module that provides caching via the local file system.

Currently compatible with cache-service 1.3.

# Basic Usage

Require and instantiate:

```javascript
const csFsCache = require('cache-service-file-system');

var fsCache = csFsCache({
    cacheRoot: './cache'
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
