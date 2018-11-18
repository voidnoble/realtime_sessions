/**
 * @brief 뉴스 세션 소켓 서버
 * @date 2016-05-19
 * @author yj.kwak@motorgraph.com
 * @description
 * 참고:
 * - https://gist.github.com/Xeoncross/85feef5806647cfc9483
 * - http://stackoverflow.com/questions/24499306/how-to-set-redisstore-node-express-socket-io-heroku
 */
'use strict';

const app = require('express')()
    , server = require('http').Server(app)
    // , cluster = require('cluster')
    // , sticky = require('sticky-session')
    , io = require('socket.io')(server)
    , db = require('./model/rethinkdb')
    , redis = require('redis')
    , redisAdapter = require('socket.io-redis')
    , store = redis.createClient(6379, '192.168.0.102')
    , publisher = redis.createClient(6379, '192.168.0.102', { return_buffers: true })
    , subscriber = redis.createClient(6379, '192.168.0.102', { return_buffers: true })
    , rollbar = require('rollbar');

// CORS
io.set('origins', 'http://localhost:* http://127.0.0.1:* http://www.domain.com:*');

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "X-Requested-With");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    res.header("Access-Control-Allow-Methods", "PUT, GET, POST, DELETE, OPTIONS");
    next();
});

// Redis Pub/Sub Adapter
io.adapter(redisAdapter({
    pubClient: publisher,
    subClient: subscriber
}));

// Error tracker
rollbar.init('0ff8a92130aa405b952738926ccc1072');
// record a generic message and send to rollbar
//rollbar.reportMessage("Hello world!");

// CPU Core 수 조회
var numCPUs = require('os').cpus().length;

/*// 마스터 클러스터이면
if (cluster.isMaster) {
    // CPU 수 만큼 워커 생성
    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }

    // 워커가 죽으면
    cluster.on('exit', (worker, code, signal) => {
        // 종료된 클러스터 로그
        console.log('워커 종료 : '+ worker.id);

        if (code == 200) {
            // 종료 코드가 200 인 경우 워커 재생성
            cluster.fork();
        }
    });
}
// 마스터 클러스터가 아니면
else {*/
    var totalSessionCount = 0;

    // HTTP Server
    server.listen(38000, () => {
        console.log('listen on *:38000');
    });

    /**
     * Connection event Socket.io
     */
    io.on('connection', (socket) => {
        //console.log('a user connected');

        // Redis subscribe("구독채널명")
        //subscriber.subscribe("sessions:total");

        /*// Routing / using express
         app.get('/', (req, res) => {
         res.sendFile(__dirname +'/index.html');
         });*/

        // Redis subscribe 되면
        // subscriber.on("subscribe", (channel, count) => {
        //     // socket.io-redis 모듈로
        //     // channel = socket.io#/#/#EjXb8OKRh6inA58gAAAX#
        //     // 과 같이 랜덤 부여됨.
        //     console.log(`Subscribed to ${channel}. Now subscribed to ${count} channel(s).`);
        // });

        // Redis publisher.publish()의 event listener
        subscriber.on("message", (channel, message) => {
            let channelString = JSON.stringify(channel);
            let messageString = JSON.stringify(message);

            //console.log(`Message ${message.data} on channel ${channel.type} arrived!`);

            // client 에서는 socket.on('message', callback) 으로 받으면 된다
            if (message.data) socket.send(message.data);
        });

        /**
         * 글에 join 하면
         */
        socket.on('join', (data) => {
            let _id = data.id;

            if (!_id) return;

            socket.newsId = _id;

            // socket.io 방 배정 방식으로 나누어보기
            // Routing /rooms/1 이면 1번 방에 배정
            socket.join(`news:${_id}`, (err) => {
                if (err) throw err;

                // RethinkDB join
                //db.joinSession(_id, data.title);

                // 자동으로 부여되는 세션같은 socket.id 로 접속 유저 구분 가능
                // console.log(`socket join ${data.id} : ${data.title}`);

                // 글번호를 글번호 인덱스용 Sets 에 저장
                store.sismember("news_ids", _id, (err, reply) => {
                    if (reply == "1") return;

                    //console.log(`on:join add ${_id} to Redis Sets news_ids`);
                    store.sadd("news_ids", _id);
                });

                // 배정된 room 에 속한 client 수
                let _count = parseInt(io.sockets.adapter.rooms[`news:${_id}`].length);
                if (isNaN(parseInt(_count))) _count = 1;

                // Redis 에 글 제목 저장
                store.set(`news:${_id}:title`, data.title, (err, response) => {
                    if (err) throw err;

                    //console.log('on:join save news:_id:title to Redis. '+ response);
                });

                // Redis 에 글 접속수 저장
                store.set(`news:${_id}:count`, _count, (err, response) => {
                    if (err) throw err;

                    //console.log('on:join save news:_id:count to Redis. '+ response);
                });

                // 글 전체 접속자 수
                let rooms = io.sockets.adapter.rooms
                    , _totalSessionCount = 0;

                for (let key in rooms) {
                    if (/^news:.+/.test(key)) {
                        _totalSessionCount += parseInt(rooms[key].length);
                    }
                }

                totalSessionCount = _totalSessionCount;

                // 글 전체 접속자 수 Redis 에 저장
                store.set("news:session:total", totalSessionCount, (err, response) => {
                    if (response == "OK") {
                        socket.emit('print_total_session_count', { totalSessionCount: totalSessionCount });
                        //publisher.publish("news:session:total", totalSessionCount);
                        //console.log('on:join news:session:total = ' + parseInt(totalSessionCount));
                    } else {
                        //console.log('on:join news:session:total set to redis failed.');
                    }
                });
            });
        });

        /**
         * 실시간 뉴스 접속자 총 수 반환
         */
        socket.on('get_total_session_count', (data) => {
            let rooms = io.sockets.adapter.rooms
                , _total = 0;

            for (let key in rooms) {
                if (/^news:.+/.test(key)) {
                    _total += parseInt(rooms[key].length);
                }
            }

            socket.emit('print_total_session_count', { total: _total, rooms: rooms });
        });

        /**
         * 접속자수 DESC 정렬 결과 리스트 반환
         */
        socket.on('get_top_news', (param) => {
            let limit = 5;

            if (typeof param == 'undefined' || typeof param.limit == 'undefined') {
                //
            } else {
                if (param.limit) limit = param.limit;
            }

            // CLI Command =
            // # redis-cli sort 'news_ids' by 'news:*:count' get '#' get 'news:*:count' get 'news:*:title' limit 0 5 desc
            // Reference = https://github.com/NodeRedis/node_redis/blob/master/examples/sort.js
            store.sort("news_ids",
                "BY", "news:*:count",
                "GET", "#",
                "GET", "news:*:title",
                "GET", "news:*:count",
                "LIMIT", "0", limit,
                "DESC",
                (err, response) => {
                    if (err) throw err;

                    io.sockets.emit('print_top_news', response);
                }
            );
        });

        /**
         * 페이지에서 떠날때
         */
        socket.on('leave', (data) => {
            leaveRoom(socket, data);
        });

        /**
         * 접속 해제시, 브라우저 창을 닫았을 때.
         */
        socket.on('disconnect', () => {
            let _id = socket.newsId;

            leaveRoom(socket, { id: _id });
            //subscriber.quit(); // redisAdapter 에서 자동으로 해제해주므로 주석처리
            //console.log(`user disconnected from ${_id}`);
        });

        /**
         * Client socket.emit('reconnect', data); 발생 감시 이벤트
         */
        socket.on('reconnect', (data) => {
            //console.log('reconnect', data);

            store.get("connection:count", (err, response) => {
                let count = parseInt(response);

                if (isNaN(parseInt(count))) count = 0;
                if (typeof count == 'undefined') count = 0;
                if (!count) count = 0;

                if (count > 0) --count;

                store.set("connection:count", count);
            });

            store.get("news:session:total", (err, response) => {
                let count = parseInt(response);

                if (isNaN(parseInt(count))) count = 0;
                if (typeof count == 'undefined') count = 0;
                if (!count) count = 0;

                if (count > 0) --count;

                store.set("news:session:total", count);
            });
        });

        socket.on('get_socket_id', () => {
            socket.emit('print_socket_id', { id: socket.id });
        });
    });
// }


function leaveRoom(socket, data) {
    let _id = data.id,
        _count = 0;

    if (typeof _id == 'undefined') return;

    // Leave the room
    socket.leave(`news:${_id}`, (err) => {
        if (err) throw err;

        //console.log(`on:leave the room news:${_id}`);
    });
    publisher.publish("sessions", `User is leaved : { userId: "${socket.id}", newsId: "${_id}" }`);

    //db.leaveSession(_id);
    //articles = db.getSession(_id);

    // 배정된 room 에 속한 client 수 재계산
    if (typeof io.sockets.adapter.rooms[`news:${_id}`] == 'undefined') {
        _count = 0;
    } else {
        _count = parseInt(io.sockets.adapter.rooms[`news:${_id}`].length);
    }
    if (isNaN(parseInt(_count))) _count = 0;

    // 배정된 room 에 속한 client 수가 0 이면 Clear
    if (_count == 0) {
        // Redis 에서 제거
        store.del(`news:${_id}:count`);
        store.del(`news:${_id}:title`);
        // 글번호를 글번호 인덱스용 Sets 에서 제거
        store.sismember("news_ids", _id, (err, response) => {
            if (response == "0") return;

            store.srem("news_ids", _id);
        });
    }
    // 배정된 room 에 속한 client 가 있다면
    else {
        // Redis 에 글번호:접속자수 업데이트
        store.set(`news:${_id}:count`, _count, (err, response) => {
            if (err) throw err;

            //console.log(response);
        });
    }

    // 글 전체 접속자 수 감소
    totalSessionCount = (totalSessionCount > 0)? --totalSessionCount : 0;
    store.decr("news:session:total", (err, response) => {
        if (err) throw err;

        let count = parseInt(response);

        if (isNaN(parseInt(count))) count = 0;
        if (typeof count == 'undefined') count = 0;
        if (!count) count = 0;

        if (count == 0) store.set("news:session:total", 0);
    });

    console.log(`user leaved from ${_id}`);
}