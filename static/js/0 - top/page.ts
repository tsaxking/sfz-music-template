enum PageEvent {
    OPEN = 'open',
    CLOSE = 'close'
}


type Query = {
    [key: string]: string | number | boolean | null | undefined;
}

class Page {
    static readonly dashboardName = window.location.pathname.split('/')[1];

    static pages: {
        [key: string]: Page;
    } = {};

    static #home: Page;

    public static get home(): Page {
        return Page.#home || Object.values(Page.pages)[0];
    }

    private static set home(home: Page) {
        if (Page.#home) throw new Error('Home page already set');
        Page.#home = home;
    }

    private static addPage(page: Page) {
        if (Page.pages[page.name]) 
            return console.error(
                new Error(`Page ${page.name} already exists`));
        Page.pages[page.name] = page;

        if (page.home) Page.home = page;
    }
    static current?: Page;
    static history: Page[] = [];



    private readonly el: HTMLElement|null;
    readonly link: HTMLAnchorElement|null;
    readonly events: {
        [key: string]: Function;
    } = {};
    readonly data: {
        [key: string]: any;
    } = {}
    readonly updates: ViewUpdate[] = [];
    readonly lowercaseName: string;
    readonly body: HTMLElement;
    readonly dom: CBS_Document;

    constructor(
        public readonly name: string, 
        public readonly home?: boolean
    ) {
        this.lowercaseName = this.name.toLowerCase().replaceAll(' ', '-');
        this.body = document.querySelector(`#${this.lowercaseName}--page-body`) as HTMLElement;
        this.dom = CBS.createDomFromElement(this.body as HTMLDivElement);

        Page.addPage(this);
        this.el = document.querySelector(`#${this.lowercaseName}`);
        this.link = document.querySelector(`a[data-target="${this.lowercaseName}"]`);

        if (this.link && this.el) {
            this.link.addEventListener('click', (e) => {
                e.preventDefault();
                this.open();
            });
        }
    }

    open(query?: Query) {
        if (Page.current === this) return;
        ViewUpdate.updates = ViewUpdate.updates.filter(vu => vu.viewUpdate.page !== this.name);

        for (const page of Object.values(Page.pages)) {
            if (page !== this && page !== Page.current) page.quietClose();
        }

        this.link?.classList.add('active');
        this.el?.classList.remove('d-none');
        Page.current?.close();
        Page.current = this;
        Page.history.push(this);

        if (this.events[PageEvent.OPEN]) {
            this.events[PageEvent.OPEN](query);
        }

        document.title = `sfzMusic ${capitalize(Page.dashboardName)} Dashboard | ${this.name}`;
        history.pushState({ page: this.name }, this.name, `/${Page.dashboardName}/${this.name.toLowerCase().replaceAll(' ', '-')}`);
        window.scrollTo(0, 0);

        for (const vu of ViewUpdate.updates) {
            if (vu.viewUpdate.page === this.name) {
                vu.viewUpdate.callback(...vu.args);
            }
        }
    }

    private quietClose() {
        this.link?.classList.remove('active');
        this.el?.classList.add('d-none');
    }

    close() {
        this.quietClose();

        if (this.events[PageEvent.CLOSE]) {
            this.events[PageEvent.CLOSE]();
        }
    }

    async fetch(path: string, body?: any, options?: RequestOptions): Promise<any> {
        if (!path.startsWith('/')) path = `/${path}`;
        return new Promise((res, rej) => {
            ServerRequest.post(`/api/${this.name.toLowerCase()}${path}`, body, options)
                .then(res)
                .catch(rej);
        });
    }

    async stream(path: string, files: FileList, options?: StreamOptions) {
        if (!path.startsWith('/')) path = `/${path}`;
        return ServerRequest.stream(`/api/${this.name.toLowerCase()}${path}`, files, options);
    }

    on(event: PageEvent, callback: (query?: Query) => void) {
        if (this.events[event]) return console.error(`Event ${event} already exists`);
        this.events[event] = callback;
    }

    newUpdate(event: string, callback: (...args: any[]) => void, filter?: (...args: any[]) => boolean) {
        const listener = SocketWrapper.listeners[event];
        if (!listener) return console.error(`Event ${event} does not exist`);


        const vu = new ViewUpdate(event, this.name, callback, filter);
        listener.add(vu);
        return vu;
    }
} 