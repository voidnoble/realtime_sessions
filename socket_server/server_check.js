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
    , cluster = require('cluster')
    , io = require('socket.io')(server)
    // , db = require('./model/rethinkdb')
    , redis = require('redis')
    , redisAdapter = require('socket.io-redis')
    , store = redis.createClient(6379, '192.168.0.102')
    , rollbar = require('rollbar');

// CORS
// io.set('origins', 'http://localhost:* http://127.0.0.1:* http://www.domain.com:*');

// Redis Pub/Sub Adapter
io.adapter(redisAdapter({ host: '192.168.0.102', port: 6379 }));

// Error tracker
rollbar.init('0ff8a92130aa405b952738926ccc1072');
// record a generic message and send to rollbar
//rollbar.reportMessage("Hello world!");

var numCPUs = require('os').cpus().length;

// // 마스터 클러스터이면
// if (cluster.isMaster) {
//     // CPU 수 만큼 워커 생성
//     for (let i = 0; i < numCPUs; i++) {
//         cluster.fork();
//     }
//
//     // 워커가 죽으면
//     cluster.on('exit', (worker, code, signal) => {
//         // 종료된 클러스터 로그
//         console.log('워커 종료 : '+ worker.id);
//
//         if (code == 200) {
//             // 종료 코드가 200 인 경우 워커 재생성
//             cluster.fork();
//         }
//     });
// }
// // 마스터 클러스터가 아니면
// else {
    // HTTP Server
    server.listen(38000, () => {
        console.log('listen on *:38000');
    });

    var articles = [];
    var totalCount = 0;

    // Connection event Socket.io
    io.on('connection', (socket) => {
        console.log('a user connected');

        // Redis publisher.publish()의 event listener
        // subscriber.on("message", (channel, message) => {
        //     let channelString = JSON.stringify(channel);
        //     let messageString = JSON.stringify(message);
        //
        //     //console.log(`Message ${message.data} on channel ${channel.type} arrived!`);
        //
        //     // client 에서는 socket.on('message', callback) 으로 받으면 된다
        //     socket.send(message.data);
        // });

        // 전체 접속자 수
        // totalCount = parseInt(io.sockets.sockets.length);
        // console.log('on:connection totalCount = '+ totalCount);

        // client 에 접속 알림
        io.sockets.emit('connected', { totalUserCount: totalCount });

        // 글에 join 하면
        socket.on('join', (data) => {
            let _id = data.id,
                _count = 0;

            // 자동으로 부여되는 세션같은 socket.id 로 접속 유저 구분 가능
            console.log(`socket join ${data.id} : ${data.title}`);

            socket.articleId = _id;

            // socket.io 방 배정 방식으로 나누어보기
            // Routing /rooms/1 이면 1번 방에 배정
            socket.join(`news:${_id}`);

            // RethinkDB join
            //db.joinSession(_id, data.title);

            // 배정된 room 에 속한 client 수
            _count = io.sockets.adapter.rooms[`news:${_id}`].length;

            // Routing /tops 방에 배정된 수가 높은 순으로 나열

            // Redis 에 글번호:접속자수 방식으로 나누어보기
            // Routing /rooms/1 이면 Redis 에 1 : ++count
            store.set(`news:${_id}:title`, data.title, (err, reply) => {
                if (err) throw err;

                console.log(reply);
            });

            store.set(`news:${_id}:count`, _count, (err, reply) => {
                if (err) throw err;

                //console.log(reply);
            });

            for(let roomName in Object.keys(io.sockets.adapter.rooms)) {
                try {
                    totalCount += parseInt(io.sockets.adapter.rooms[roomName].length);
                } catch (e) {
                    console.error('on:join totalCount += ', e.message);
                }
            }

            console.log('Redis set news:session:total = '+ totalCount);
            store.set('news:session:total', totalCount);

            //publisher.publish("news:session:total", totalCount);
        });

        socket.on('disconnect', () => {
            let _id = socket.articleId;

            // Leave the room
            //socket.leave(socket.articleId);
            //publisher.publish("sessions", "User is disconnected : { userId: "+ socket.id + ", articleId: "+ socket.articleId +" }");
            // subscriber.quit(); // redisAdapter 에서 자동으로 해제해주므로 주석처리

            //totalCount = io.sockets.sockets.length;

            io.sockets.emit('disconnect', { totalUserCount: totalCount });

            console.log('user disconnected');
        });
    });
// }