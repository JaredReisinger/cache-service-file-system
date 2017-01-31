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
    log(this, 'get() called', { key: key });
    var name = fullPathify(this, key);
    getFile(this, key, name, (err, obj) => {
        if (err) {
            callback(err);
            return;
        }
        callback(null, obj.data);
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
        key: key,
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

// mgetall and relativePathify aren't a part of the cache-service API, but are
// exposed as supported helpers.
FSCache.prototype.mgetall = function mgetall(callback) {
    var self = this;
    log(self, 'mgetall() called');
    getTreeOrFile(self, self.cacheRoot, {}, (err, data) => {
        log(self, 'mgetall() got', { data: data, err: err })
    });
};

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

function getFile(self, key, name, callback) {
    log(self, 'getFile() called', { key: key, name: name });
    fs.readFile(name, (err, data) => {
        if (err) {
            error(self, 'getFile() read error', { key: key, name: name, err: err });
            callback(err);
            return;
        }

        try {
            var obj = JSON.parse(data.toString());

            if (!!key && obj.key !== key) {
                error(self, 'getFile() key does not match!', { key: key, dataKey: obj.key });
                throw 'key mismatch';
            }

            if (fullPathify(self, obj.key) !== name) {
                error(self, 'getFile() key does not match path!');
                throw 'key/path mismatch';
            }

            if (obj.expires > 0 && obj.expires <= Date.now()) {
                log(self, 'getFile() data has expired!', { key: key });
                throw 'data has expired';
            }

            callback(null, obj);
        } catch (err) {
            error(self, 'getFile() JSON error', { key: key, err: err });
            callback(err);
        }
    });
}

function getTreeOrFile(self, curPath, results, callback) {
    log(self, 'getTreeOrFile() called', { curPath: curPath })
    fs.readdir(curPath, (err, files) => {
        if (err) {
            // if file, try to load it directly!... and return the key/value in
            // an object
            log(self, 'getTreeOrFile() readdir error', { curPath: curPath, err: err });
            getFile(self, null, curPath, (err, obj) => {
                if (err) {
                    error(self, 'getTreeOrFile() file error', { curPath: curPath, err: err });
                    callback(err);
                    return;
                }
                results[obj.key] = obj.data;
                callback(null, results);
            });
            return;
        }

        // successful means we need to recurse on each item...
        log(self, 'getTreeOrFile() got', { files: files, err: err });
        var done = 0;
        for (const file of files) {
            getTreeOrFile(self, path.join(curPath, file), results, (err, data) => {
                if (err) {
                    error(self, 'getTreeOrFile() dir error', { curPath: curPath, file: file, err: err });
                    callback(err);
                    return;
                }
                done++;
                if (done === files.length) {
                    callback(null, data);
                }
            });
        }
    });
}

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
