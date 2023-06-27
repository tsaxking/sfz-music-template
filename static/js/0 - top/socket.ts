const socket = io();


socket.on('disconnect', () => {
    socket.io.reconnect();
});