enum PageEvent {
    OPEN = 'open',
    CLOSE = 'close',
    LOAD = 'load'
}

interface PageInterface {
    on: (event: PageEvent, fn: Function) => void;
}

type SocketListener = {
    event: string;
    fn: Function;
}

class Page {
    private static pages: {
        [key: string]: Page;
    } = {};
    private static addPage(page: Page) {
        if (!Page.pages[page.name]) 
            return console.error(
                new Error(`Page ${page.name} already exists`));
        Page.pages[page.name] = page;
    }
    private static current?: Page;
    private static history: Page[] = [];

    sockets: SocketListener[] = [];

    constructor(public readonly name: string) {
        Page.addPage(this);
        const p = document.querySelector(`[data-page="${this.constructor.name}"]`);
        const a = document.querySelector(`a[data-target="${this.constructor.name}"]`);

        if (p && a) {
            a.addEventListener('click', (e) => {
                e.preventDefault();
                Page.current?.close();
                this.open();
            });
        }
    }

    open() {
        for (const listener of this.sockets) {
            socket.on(listener.event, listener.fn);
        }

        socket.emit('page-open', this.constructor.name);
        Page.current = this;
    }

    close() {
        for (const listener of this.sockets) {
            socket.off(listener.event, listener.fn);
        }

        Page.history.push(this);
    }

    async fetch(path: string, body?: any): Promise<any> {
        if (!path.startsWith('/')) path = `/${path}`;
        return new Promise((res, rej) => {
            fetch(`/api/${this.name.toLowerCase()}${path}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            })
                .then(response => response.json())
                .then(data => res(data))
                .catch(err => rej(err));
        });
    }

    async stream(path: string, files: FileList, options?: StreamOptions) {
        if (!path.startsWith('/')) path = `/${path}`;
        return fileStream(`/api/${this.name.toLowerCase()}${path}`, files, options);
    }
} 