/**
 * A fork of the [node.js chat app](https://github.com/eiriksm/chat-test-2k)
 * by [@orkj](https://twitter.com/orkj) using socket.io, rethinkdb, passport and bcrypt on an express app.
 *
 * See the [GitHub README](https://github.com/rethinkdb/rethinkdb-example-nodejs-chat/blob/master/README.md)
 * for details of the complete stack, installation, and running the app.
 *
 * Created by yjkwak on 2016. 5. 9..
 */

const r = require('rethinkdb')
    , util = require('util')
    , assert = require('assert')
    , logdebug = require('debug')('rdb:debug')
    , logerror = require('debug')('rdb:error')
    , rollbar = require('rollbar');

// # Error tracker
rollbar.init('0ff8a92130aa405b952738926ccc1072');
// record a generic message and send to rollbar
//rollbar.reportMessage("Hello world!");

// # Connection details

// RethinkDB database settings. Defaults can be overridden using environment variables.
const dbConfig = {
    host: process.env.RDB_HOST || '192.168.0.102',
    port: parseInt(process.env.RDB_PORT) || 28015,
    db: process.env.RDB_DB,
    tables: ['sessions']
};

/**
 * Connect to RethinkDB instance and perform a basic database setup:
 *
 * - create the `RDB_DB` database (defaults to `xxx`)
 * - create tables `users in this database
 */
const setup = () => {
    r.connect(
        {
            host: dbConfig.host,
            port: dbConfig.port
        },
        (err, connection) => {
            assert.ok(err == null, err);

            r.dbCreate(dbConfig.db).run(connection, (err, result) => {
                if (err) {
                    logdebug("[DEBUG] RethinkDB database '%s' already exists (%s:%s)\n%s", dbConfig.db, err.name, err.msg, err.message);
                    rollbar.reportMessage(`[DEBUG] RethinkDB database '${dbConfig.db}' already exists (${err.name}:${err.msg})\n${err.message}`);
                } else {
                    logdebug("[INFO] RethinkDB database '%s' created", dbConfig.db);
                }

                for(var tbl in dbConfig.tables) {
                    ((tableName) => {
                        r.db(dbConfig.db).tableCreate(tableName)
                            .run(connection, (err, result) => {
                                if (err) {
                                    logdebug("[DEBUG] RethinkDB table '%s' already exists (%s:%s)\n%s", tableName, err.name, err.msg, err.message);
                                    rollbar.reportMessage(`[DEBUG] RethinkDB table '${tableName}' already exists (${err.name}:${err.msg})\n${err.message}`);
                                } else {
                                    logdebug("[INFO] RethinkDB table '%s' created", tableName);
                                }
                            }
                        );
                    })(tbl);
                }
            });
        }
    );
};

// # Filtering results

// # Retrieving sessions

/**
 * To find the last `max_results` messages ordered by `timestamp`
 *
 * @param err
 * @param connection
 */
var findMessages = (max_results, callback) => {
    onConnect((err, connection) => {
        r.db(dbConfig.db).table('sessions').orderBy(r.desc('timestamp')).limit(max_results).run(connection, (err, cursor) => {
            if (err) {
                logerror("[ERROR][%s][findMessages] %s:%s\n%s", connection['_id'], err.name, err.msg, err.message);
                rollbar.reportMessage(`[ERROR][${connection['_id']}][findMessages] ${err.name}:${err.msg}\n${err.message}`);

                callback(null, []);
                connection.close();
            } else {
                cursor.toArray((err, results) => {
                    if (err) {
                        logerror("[ERROR][%s][findMessages][toArray] %s:%s\n%s", connection['_id'], err.name, err.msg, err.message);
                        rollbar.reportMessage(`[ERROR][${connection['_id']}][toArray] ${err.name}:${err.msg}\n${err.message}`);

                        callback(null, []);
                    } else {
                        callback(null, results);
                    }

                    connection.close();
                });
            }
        })
    });
};

const getSession = (id) => {
    if (typeof id == 'undefined') {
        console.log(`[ERROR][getSession] id is undefined.`);
        return false;
    }

    return onConnect((err, connection) => {
        return r.db(dbConfig.db).table('sessions').filter({ id: id }).run(connection, (err, cursor) => {
            if (err) {
                logerror("[ERROR][%s][getSession] %s:%s\n%s", connection['_id'], err.name, err.msg, err.message);
                rollbar.reportMessage(`[ERROR][${connection['_id']}][getSession] ${err.name}:${err.msg}\n${err.message}`);

                connection.close();

                return err;
            } else {
                cursor.toArray((err, results) => {
                    if (err) {
                        logerror("[ERROR][%s][getSession][toArray] %s:%s\n%s", connection['_id'], err.name, err.msg, err.message);
                        rollbar.reportMessage(`[ERROR][${connection['_id']}][getSession][toArray] ${err.name}:${err.msg}\n${err.message}`);
                    }

                    connection.close();

                    return results;
                });
            }
        });
    });
};

const getTopSessions = (limit) => {
    limit = limit || 10;

    return onConnect((err, connection) => {
        return r.db(dbConfig.db).table('sessions').orderBy(r.desc('count')).limit(limit).run(connection, (err, cursor) => {
            if (err) {
                logerror("[ERROR][%s][getTopSessions] %s:%s\n%s", connection['_id'], err.name, err.msg, err.message);
                rollbar.reportMessage(`[ERROR][${connection['_id']}][getTopSessions] ${err.name}:${err.msg}\n${err.message}`);
            } else {
                let results = [];

                cursor.each(function (err, row) {
                    if (err) throw err;

                    results.push(row);
                }, function (err, results) {
                    if (err) throw err;

                    return results;
                });

                /* 다른 방법
                 return cursor.toArray().then(function (results) {
                 //let json = JSON.stringify(results);
                 //console.log(`[LOG][getTopSessions] results = ${json}`);
                 return results;
                 }).error(console.log);*/
            }
        });
    });
};

const joinSession = (id, title) => {
    return onConnect((err, connection) => {
        console.log(`[LOG][joinSession] news id = ${id}`);

        // 이미 존재 여부 파악
        return r.db(dbConfig.db).table('sessions')('id').count(id).run(connection, (err, result) => {
            if (err) {
                logerror("[ERROR][%s][joinSession] %s:%s\n%s", connection['_id'], err.name, err.msg, err.message);
                rollbar.reportMessage(`[ERROR][${connection['_id']}][joinSession] ${err.name}:${err.msg}\n${err.message}`);
                return false;
            } else {
                console.log(`[LOG][${connection['_id']}][joinSession].count(${id}) result = ${result}`);

                // 이미 존재하면 사용자수만 증가
                if (result > 0) {
                    r.db(dbConfig.db).table('sessions').get(id).update({ count: r.row('count').add(1) }).run(connection, (err, result) => {
                        if (err) {
                            rollbar.reportMessage(`[ERROR][${connection['_id']}][joinSession][add count] ${err.name}:${err.msg}\n${err.message}`);
                        }

                        connection.close();
                    });
                }
                // 존재하지 않는 row 이면 insert()
                else {
                    let data = {
                        id: id,
                        title: title,
                        count: 1
                    };

                    r.db(dbConfig.db).table('sessions').insert(data).run(connection, (err, result) => {
                        if (err) {
                            rollbar.reportMessage(`[ERROR][${connection['_id']}][joinSession][insert] ${err.name}:${err.msg}\n${err.message}`);
                        }

                        connection.close();
                    });
                }

                return true;
            }
        });
    });
};

const leaveSession = (id) => {
    if (typeof id == 'undefined') {
        console.log(`[ERROR][leaveSession] id is undefined.`);
        return false;
    }

    return onConnect((err, connection) => {
        console.log(`[LOG][leaveSession] news id = ${id}`);

        return r.db(dbConfig.db).table('sessions').get(id).update({ count: r.row('count').sub(1) }).run(connection, (err, result) => {
            if (err) {
                rollbar.reportMessage(`[ERROR][${connection['_id']}][leaveSession] ${err.name}:${err.msg}\n${err.message}`);
                connection.close();
                return false;
            }

            connection.close();
            return true;
        })
    });
};

const getSessionsCount = () => {
    return onConnect((err, connection) => {
        return r.db(dbConfig.db).table('sessions').sum('count').run(connection, (err, result) => {
            let count = 0;

            if (err) {
                logerror("[ERROR][%s][getSessionsCount] %s:%s\n%s", connection['_id'], err.name, err.msg, err.message);
                rollbar.reportMessage(`[ERROR][${connection['_id']}][getSessionsCount] ${err.name}:${err.msg}\n${err.message}`);
                connection.close();
            } else {
                count = result;
                connection.close();
            }

            return count;
        });
    });
};

// # Helper functions

/**
 * A wrapper function for the RethinkDB API `r.connect`
 * 
 * @param callback
 */
function onConnect(callback) {
    r.connect(
        {
            host: dbConfig.host,
            port: dbConfig.port
        },
        (err, connection) => {
            if (err) {
                rollbar.reportMessage(`[ERROR][model/rethinkdb][onConnect] ${err.name}:${err.msg}\n${err.message}`);
            }

            assert.ok(err === null, err);

            connection['_id'] = Math.floor(Math.random() * 10001);

            callback(err, connection);
        }
    );
}

module.exports = {
    setup: setup,
    getSession: getSession,
    getTopSessions: getTopSessions,
    joinSession: joinSession,
    leaveSession: leaveSession,
    getSessionsCount: getSessionsCount
};