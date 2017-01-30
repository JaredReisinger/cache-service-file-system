'use strict';

const fs = require('fs');
const path = require('path');
const mkdirp = require('mkdirp');

function FSCache(config) {
    config = config || {};

    this.cacheRoot = path.resolve(config.cacheRoot || './cache');
    this.pathifyFn = config.pathify || this.relativePathify.bind(this);
    this.verbose = config.verbose || false;
    // cache module required config values
    this.type = config.type || 'file-system';
    this.defaultExpiration = config.defaultExpiration || 900;
    this.checkOnPreviousEmpty = config.checkOnPreviousEmpty || true;
    this.readOnly = config.readOnly || false;
}

// === cache-service API (public) ===

FSCache.prototype.get = function get(key, callback) {
    var self = this;
    log(self, 'get() called', { key: key });
    var name = fullPathify(this, key);
    fs.readFile(name, (err, data) => {
        var result = null;
        if (err) {
            error(self, 'get() read error', { key: key, err: err });
        } else {
            try {
                result = JSON.parse(data.toString());
                // TODO: have to check to see if the data has expired!
                if (result.expires > 0 && result.expires <= Date.now()) {
                    log(self, 'get() data has expired!', { key: key })
                    throw 'data has expired';
                    result = null;
                } else {
                    result = result.data;
                }
            } catch (err) {
                error(self, 'get() JSON error', { key: key, err: err })
            }
        }
        callback(err, result);
    });
};

FSCache.prototype.mget = function mget(keys, callback) {
    var self = this;
    log(self, 'mget() called', { keys: keys });
    var result = {};
    var errors = [];
    var done = 0;
    for (const key of keys) {
        self.get(key, (err, obj) => {
            if (err) {
                error(self, 'mget() error on key', { key: key, err: err })
                errors.push({ key: key, err: err });
            } else {
                result[key] = obj;
            }
            done++;
            if (done === keys.length) {
                callback(null, result);
            }
        });
    }
};

FSCache.prototype.set = function set(key, value, expiration, refresh, callback) {
    var self = this;
    log(self, 'set() called', { key: key, value: value });
    if (arguments.length === 3 && typeof expiration === 'function') {
        callback = expiration;
        expiration = self.defaultExpiration;
    } else if (arguments.length === 4) {
        callback = refresh;
        if (typeof expiration === 'function') {
            refresh = expiration;
            expiration = self.defaultExpiration;
        }
    }
    callback = callback || noop;
    var filePath = fullPathify(self, key);
    // UTC expiration in milliseconds, zero means "never expires".
    var expires = expiration > 0 ? Date.now() + (expiration * 1000) : 0;
    var cacheData = {
        expires: expires,
        data: value,
    };
    var data = JSON.stringify(cacheData);
    mkdirp(path.dirname(filePath), err => {
        fs.writeFile(filePath, data, err => {
            error(self, 'set() error', { key: key, err: err });
            callback(err);
        });
    });
};

FSCache.prototype.mset = function mset(obj, expiration, callback) {
    var self = this;
    log(self, 'mset() called', { obj: obj });
    if (arguments.length === 2 && typeof expiration === 'function') {
        callback = expiration;
        expiration = self.defaultExpiration;
    }
    callback = callback || noop;
    var keys = obj.keys();
    var errors = [];
    var done = 0;
    for (const key of keys) {
        // TODO: see if obj[key] has a cacheValue property?
        self.set(key, obj[key], expiration, err => {
            if (err) {
                error(self, 'mget() error on key', { key: key, err: err })
                errors.push({ key: key, err: err });
            }
            done++;
            if (done === keys.length) {
                callback(null);
            }
        });
    }
};

FSCache.prototype.del = function del(keys, callback) {
    var self = this;
    log(self, 'del() called', { keys: keys });
    callback = callback || noop;
    if (typeof keys === 'string') {
        keys = [keys];
    }
    var succeeded = 0;
    var done = 0;
    for (const key of keys) {
        delKey(self, key, err => {
            if (err) {
                error(self, 'del() err on key', { key: key, err: err });
            } else {
                succeeded++;
            }
            done++;
            if (done === keys.length) {
                // TODO: pass back partial errors?
                callback(null, succeeded);
            }
        });
    }
};

FSCache.prototype.flush = function flush(callback) {
    error(this, 'flush() called... NYI!');
    callback = callback || noop;
    callback('NYI!');
};

FSCache.prototype.db = 'none'; // bogus truthy value, just in case

// relativePathify isn't a part of the cache-service API, but is exposed so
// that custom pathify implementations can use it to get the automatic
// directory beahvior.
FSCache.prototype.relativePathify = function relativePathify(key) {
    var parts = [];
    var remaining = key;
    while (remaining.length > 2) {
        parts.push(remaining.substr(0, 2));
        remaining = remaining.substr(2);
    }
    parts.push(key + '.json');

    return path.join.apply(path, parts);
};

// === internal helpers (private, 'this' value explicity pased as 'self') ===

function delKey(self, key, callback) {
    log(self, 'delKey() called', { key: key });
    var name = fullPathify(self, key);
    fs.unlink(name, callback);
}

function fullPathify(self, key) {
    return path.join(self.cacheRoot, self.pathifyFn(key));
}

function log(self, message, data) {
    _log(self, false, message, data);
};

function error(self, message, data) {
    _log(self, true, message, data);
};

function _log(self, isError, message, data) {
    if (isError || self.verbose) {
        console.log(self.type + ': ' + message, data);
    }
};

function noop() {}


exports = module.exports = FSCache;
