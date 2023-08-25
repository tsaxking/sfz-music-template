const __socket = io();

__socket.on('disconnect', () => {
    socket.io.reconnect();
});

type SocketMetadata = {
    time: number;
};

class ViewUpdateWrapper {
    public readonly args: any[];
    
    constructor(public readonly viewUpdate: ViewUpdate, ...args: any[]) {
        this.args = args;
    }
}


class SocketListener {
    updates: ViewUpdate[] = [];

    constructor(public readonly event: string) {}

    add(viewUpdate: ViewUpdate) {
        this.updates.push(viewUpdate);
    }
}

class ViewUpdate {
    static updates: ViewUpdateWrapper[] = [];
    constructor(
        public readonly page: string,
        public readonly callback: (...args: any[]) => void,
        public readonly filter?: (...args: any[]) => boolean
    ) {} 
}

class SocketWrapper {
    static listeners: {
        [key: string]: SocketListener;
    } = {};



    constructor(private readonly socket: any) {}

    get io() {
        return this.socket.io;
    }


    // wrapper for socket so that it can update the model and view if on the correct page with a single listener
    on(event: string, dataUpdate: (...args: any[]) => void) {
        if (SocketWrapper.listeners[event]) return console.error(`Event ${event} already has a listener`);
        const listener = new SocketListener(event);
        SocketWrapper.listeners[event] = listener;

        this.socket.on(event, (/* metadata: SocketMetadata, */ ...args: any[]) => {
            dataUpdate(...args);

            for (const vu of listener.updates) {
                // filter is a custom function that returns true if the view should update based on the data received
                if (vu.filter && !vu.filter(...args)) continue;
                if (Page.current?.name === vu.page) {
                    vu.callback(...args);
                } else {
                    ViewUpdate.updates.push(
                        new ViewUpdateWrapper(vu, ...args)
                    );
                }
            }
        });
    }
}

const socket = new SocketWrapper(__socket);

// const socket = io();
socket.on('disconnect', () => {
    socket.io.reconnect();
});