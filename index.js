'use strict';

const fs = require('fs');
const path = require('path');
const mkdirp = require('mkdirp');

function filesystemCacheModule(config) {
    var self = this;
    config = config || {};
    self.cacheRoot = path.resolve(config.cacheRoot || './cache');
    self.readOnly = config.readOnly || false;
    self.verbose = config.verbose || false;
    self.type = config.type || 'file-system';

    // === cache-service API (public) ===

    self.get = function get(key, callback) {
        log('get() called', { key: key });
        var name = pathify(key);
        fs.readFile(name, (err, data) => {
            var result = null;
            if (err) {
                error('get() read error', { key: key, err: err });
            } else {
                try {
                    result = JSON.parse(data.toString());
                } catch (err) {
                    error('get() JSON error', { key: key, err: err })
                }
            }
            callback(err, result);
        });
    };

    self.mget = function mget(keys, callback) {
        log('mget() called', { keys: keys });
        var result = {};
        var errors = [];
        var done = 0;
        for (const key of keys) {
            self.get(key, (err, obj) => {
                if (err) {
                    error('mget() error on key', { key: key, err: err })
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

    self.set = function set(key, value, expiration, refresh, callback) {
        log('set() called', { key: key, value: value });
        if (arguments.length === 3 && typeof expiration === 'function') {
            callback = expiration;
            expiration = undefined;
        } else if (arguments.length === 4) {
            callback = refresh;
            if (typeof expiration === 'function') {
                refresh = expiration;
                expiration = undefined;
            }
        }
        callback = callback || noop;
        var filePath = pathify(key);
        var data = JSON.stringify(value);
        mkdirp(path.dirname(filePath), err => {
            fs.writeFile(filePath, data, err => {
                error('set() error', { key: key, err: err });
                callback(err);
            });
        });
    };

    self.mset = function mset(obj, expiration, callback) {
        log('mset() called', { obj: obj });
        if (arguments.length === 2 && typeof expiration === 'function') {
            callback = expiration;
            expiration = undefined;
        }
        callback = callback || noop;
        var keys = obj.keys();
        var errors = [];
        var done = 0;
        for (const key of keys) {
            // TODO: see if obj[key] has a cacheValue property?
            self.set(key, obj[key], err => {
                if (err) {
                    error('mget() error on key', { key: key, err: err })
                    errors.push({ key: key, err: err });
                }
                done++;
                if (done === keys.length) {
                    callback(null);
                }
            });
        }
    };

    self.del = function del(keys, callback) {
        log('del() called', { keys: keys });
        callback = callback || noop;
        if (typeof keys === 'string') {
            keys = [keys];
        }
        var succeeded = 0;
        var done = 0;
        for (const key of keys) {
            delKey(key, err => {
                if (err) {
                    error('del() err on key', { key: key, err: err });
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

    self.flush = function flush(callback) {
        error('flush() called... NYI!');
        callback = callback || noop;
        callback('NYI!');
    };

    self.db = 'none'; // bogus truthy value, just in case

    // === internal helpers (private) ===

    function delKey(key, callback) {
        log('delKey() called', { key: key });
        var name = pathify(key);
        fs.unlink(name, callback);
    }

    function pathify(key) {
        var parts = [self.cacheRoot];
        var remaining = key;
        while (remaining.length > 2) {
            parts.push(remaining.substr(0, 2));
            remaining = remaining.substr(2);
        }
        parts.push(key + '.json');

        return path.join.apply(path, parts);
    }

    function log(message, data) {
        _log(false, message, data);
    };

    function error(message, data) {
        _log(true, message, data);
    };

    function _log(isError, message, data) {
        if (isError || self.verbose) {
            console.log(self.type + ': ' + message, data);
        }
    };

    function noop() {}
}


exports = module.exports = filesystemCacheModule;
