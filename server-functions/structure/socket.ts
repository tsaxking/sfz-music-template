import { Server, Socket } from "socket.io";
import { parseCookie } from "./cookie";
import { Session } from "./sessions";
import { workerData, isMainThread, parentPort } from "worker_threads";

type SocketMetadata = {
    time: number;
}

type SocketQueue = { 
    event: string, 
    args: any[], 
    room?: string, 
    metadata: SocketMetadata 
}

export class SocketWrapper {
    static sockets: {
        [key: string]: SocketWrapper
    } = {};


    queue: SocketQueue[] = [];
    numTries = 0;

    constructor(private readonly socket: Socket) {
        // get cookie from socket
        const { cookie } = socket.handshake.headers;
        const { tab } = parseCookie(cookie || '');
        if (!tab) return;

        if (SocketWrapper.sockets[tab]) {
            const { queue } = SocketWrapper.sockets[tab];
            for (const q of queue) {
                if (q.room) {
                    socket.to(q.room).emit(q.event, q.metadata, ...q.args);
                } else {
                    socket.emit(q.event, q.metadata, ...q.args);
                }
            }

            SocketWrapper.sockets[tab].socket.disconnect();
        }

        SocketWrapper.sockets[tab] = this;
    }

    emit(event: string, ...args: any[]) {
        if (!this.socket.connected) return this.queue.push({
            event,
            args,
            metadata: {
                time: Date.now()
            }
        });

        this.socket.emit(event, 
            // {
            //     time: Date.now()
            // }, 
        ...args);
    }

    to(room: string) {
        return {
            emit: (event: string, ...args: any[]) => {
                if (!this.socket.connected) return this.queue.push({
                    event,
                    args,
                    room,
                    metadata: {
                        time: Date.now()
                    }
                });

                this.socket.to(room).emit(event, {
                    time: Date.now()
                }, ...args);
            }
        }
    }
}


export var io: Server|null = null;

export const initSocket = (server: Server) => {
    io = server;
    io.on('connection', (socket) => {
        console.log('a user connected');
        const s = Session.addSocket(socket);
        if (!s) return;
        // your socket code here
    
        // ▄▀▀ ▄▀▄ ▄▀▀ █▄▀ ██▀ ▀█▀ ▄▀▀ 
        // ▄█▀ ▀▄▀ ▀▄▄ █ █ █▄▄  █  ▄█▀ 
    
    
        socket.on('ping', () => socket.emit('pong'));
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
        socket.on('disconnect', () => {
            // reconnect
        });
    });
};