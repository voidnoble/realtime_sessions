/**
 * @brief 동시접속자 수 웹소켓 연결 클라이언트 앱
 * @author Created by yj.kwak@motorgraph.com
 * @date 2016. 5. 10.
 * @description
 *  http://socket.io/docs/client-api/#socket
 */
'use strict';

var _host = "xxx.xxx.x.106";

var socket = io('http://'+ _host +':38000');

var _id = location.pathname.replace('/article/', '');
var _title = document.title;

socket.on('connect', function () {
    console.log('client socket.on:connect event fired.');

    let data = {
        id: _id,
        title: _title
    };

    console.log('client join.', data);
    socket.emit('join', data);
});

socket.on('disconnect', function (data) {
    if (data == "transport close") {
        console.log('socket on:disconnect 서버 강종됨.');
    } else {
        console.log('socket on:disconnect', data);
    }
});

socket.on('reconnect', function () {
    let data = {
        id: _id,
        title: _title
    };

    console.log('socket on:reconnect', data);
    //socket.emit('reconnect', data);   // Uncaught RangeError: Maximum call stack size exceeded
});

socket.on('top_articles', function (data) {
    console.log('socket on:top_articles', data);
});

socket.on('print_total_session_count', function (data) {
    console.log('socket on:print_total_session_count', data);
});

socket.on('print_top_news', function (data) {
    console.log('socket on:print_top_news', data);
});

socket.on('message', function (message) {
    console.log('socket on:message', message);
});
