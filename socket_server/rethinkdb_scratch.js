/**
 * Scratch RethinkDB
 *
 * @date Created by yjkwak on 2016. 5. 9..
 */
'use strict';

const r = require('rethinkdb');

var qConn = r.connect({
    "host": "localhost",
    "port": 28015,
    "db": "test"
});

qConn.then((conn) => {
    // Create table
    r.db('test').tableCreate('authors').run(conn, (err, result) => {
        if (err) throw err;

        console.log(JSON.stringify(result, null, 2));
    });

    // Insert data
    r.table('authors').insert([
        { name: "William Adama", tv_show: "Battlestar Galactica",
            posts: [
                {title: "Decommissioning speech", content: "The Cylon War is long over..."},
                {title: "We are at war", content: "Moments ago, this ship received word..."},
                {title: "The new Earth", content: "The discoveries of the past few days..."}
            ]
        },
        { name: "Laura Roslin", tv_show: "Battlestar Galactica",
            posts: [
                {title: "The oath of office", content: "I, Laura Roslin, ..."},
                {title: "They look like us", content: "The Cylons have the ability..."}
            ]
        },
        { name: "Jean-Luc Picard", tv_show: "Star Trek TNG",
            posts: [
                {title: "Civil rights", content: "There are some words I've known since..."}
            ]
        }
    ]).run(conn, (err, result) => {
        if (err) throw err;

        console.log(JSON.stringify(result, null, 2));
    });

    // Retrieve all documents in a table
    r.table('authors').run(conn, (err, cursor) => {
        if (err) throw err;

        cursor.toArray((err, result) => {
            if (err) throw err;

            console.log(JSON.stringify(result, null, 2));
        });
    });

    /*// Close connection
    if (conn != null) {
        conn.close((err) => {
            if (err) throw err;
        });
    }*/
}).error((error) => {
    console.log(error);
});
