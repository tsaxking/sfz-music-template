import * as sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import * as path from 'path';
import * as fs from 'fs';

type Resolve<T> = (value?: T | PromiseLike<T>) => void;
type Reject = (reason?: any) => void;

type QueryName = {
    run: {
        "change-password": [
            string,
            string,
            null,
            string
        ],
        "delete-account": [
            string
        ],
        "new-account": [
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            boolean
        ],
        "request-password-change": [
            string,
            string
        ],
        "insert-tba": [
            string,
            string, 
            string
        ],
        "set-verification": [
            string,
            string
        ],
        'change-email': [
            string,
            string
        ],
        'verify': [
            string
        ],
        'add-account-role': [
            string,
            string
        ],
        'remove-account-role': [
            string,
            string
        ],
        'change-username': [
            string,
            string
        ],
        'request-email-change': [
            string,
            string
        ],
        'update-member-status': [
            string,
            string
        ],
        'insert-member': [
            string,
            string
        ],
        'delete-member': [
            string
        ],
        'update-bio': [
            string,
            string
        ],
        'update-title': [
            string,
            string
        ],
        'add-member-skill': [
            string,
            string,
            number
        ],
        'remove-member-skill': [
            string,
            string
        ],
        'update-resume': [
            string,
            string
        ]
    }
    exec: {};
    get: {
        "account-from-email": [
            string
        ],
        "account-from-username": [
            string
        ],
        "account-from-password-change": [
            string
        ],
        "role-from-name": [
            string
        ],
        "has-tba": [
            string
        ],
        "account-from-verification-key": [
            string
        ],
        'member-from-username': [
            string
        ],
        'member-skill': [
            string,
            string
        ]
    }
    all: {
        "accounts": [],
        "unverified": [],
        "verified": [],
        "tables": [],
        "table-info": [
            string
        ],
        "roles": [],
        'account-roles': [
            string
        ],
        'permissions-from-role': [
            string
        ],
        'members': [],
        'member-skills': [
            string
        ],
        'board': [],
        'account-member-join': []
    }
    each: {};
}






type QueryType = 
    'exec' |
    'get' |
    'all' |
    'each' |
    'run';

type QueryMap = {
    exec: Map<keyof QueryName["exec"], string>;
    get: Map<keyof QueryName["get"], string>;
    all: Map<keyof QueryName["all"], string>;
    each: Map<keyof QueryName["each"], string>;
    run: Map<keyof QueryName["run"], string>;
}

const queries: QueryMap = {
    exec: new Map<keyof QueryName["exec"], string>(),
    get: new Map<keyof QueryName["get"], string>(),
    all: new Map<keyof QueryName["all"], string>(),
    each: new Map<keyof QueryName["each"], string>(),
    run: new Map<keyof QueryName["run"], string>()
};

fs.readdirSync(path.join(__dirname, '../db/queries')).forEach(dir => {
    // dir = QueryType
    const dirPath = path.join(__dirname, '../db/queries', dir);
    if (!fs.lstatSync(dirPath).isDirectory()) return;
    fs.readdirSync(dirPath).forEach(file => {
        const content = fs.readFileSync(path.join(dirPath, file), 'utf-8');
        const name = file.split('.')[0];
        switch (dir as QueryType) {
            case 'all':
                queries.all.set(name as keyof QueryName["all"], content);
                break;
            case 'each':
                queries.each.set(name as keyof QueryName["each"], content);
                break;
            case 'exec':
                queries.exec.set(name as keyof QueryName["exec"], content);
                break;
            case 'get':
                queries.get.set(name as keyof QueryName["get"], content);
                break;
            case 'run':
                queries.run.set(name as keyof QueryName["run"], content);
                break;
        }
    });
});

type Query = {
    type: QueryType;
    query: string;
    params: any[];
    resolve: Resolve<any>;
    reject: Reject;
}


type QueryParam = number | string | boolean | null | undefined;

export class DB {
    static fromId(id: QueryName[keyof QueryName], type: QueryType): string {
        let query: string|undefined;
        switch (type) {
            case 'all':
                query = queries.all.get(id as keyof QueryName["all"]);
                break;
            case 'each':
                query = queries.each.get(id as keyof QueryName["each"]);
                break;
            case 'exec':
                query = queries.exec.get(id as keyof QueryName["exec"]);
                break;
            case 'get':
                query = queries.get.get(id as keyof QueryName["get"]);
                break;
            case 'run':
                query = queries.run.get(id as keyof QueryName["run"]);
                break;
        }

        if (!query) throw new Error('Query not found: ' + type + '/' + id);
        return query;
    }


    filename: string;
    db: Database|undefined;
    queue: Query[];
    queueRunning: boolean;
    path: string;




    constructor(filename: string) {
        this.filename = filename;
        this.queue = [];
        this.queueRunning = false;

        this.path = path.join(__dirname, '..', 'db', './' + filename + '.db');

        if (!fs.existsSync(path.join(__dirname, '..', 'db'))) {
            fs.mkdirSync(path.join(__dirname, '..', 'db'));
        }

        if (!fs.existsSync(this.path)) {
            fs.writeFileSync(this.path, '');
        }

        this.init();
    }

    async init() {
        if (this.db) return;
        this.db = await open({
            filename: this.path,
            driver: sqlite3.Database
        });
    }

    async runQueue(query: Query) {
        this.queue.push(query);
        if (this.queueRunning) return;
        this.queueRunning = true;

        while (this.queue.length > 0) {
            const query = this.queue[0];
            if (!query) continue;
            try {
                const d = await this.runQuery(query);
                query.resolve(d);
            } catch (err) {
                query.reject(err);
            }
            this.queue.shift();
        }


        this.queueRunning = false;
    }

    async runQuery(query: Query) {
        await this.init();
        let data: any;
        switch (query.type) {
            case 'exec':
                data = await this.db?.exec(query.query, query.params);
                break;
            case 'get':
                data = await this.db?.get(query.query, query.params);
                break;
            case 'all':
                data = await this.db?.all(query.query, query.params);
                break;
            case 'each':
                data = await this.db?.each(query.query, query.params);
                break;
            case 'run':
                data = await this.db?.run(query.query, query.params);
                break;
        }

        return data;
    }



    private execute(type: QueryType, query: string, params?: QueryParam[]):Promise<any> {
        return new Promise((resolve, reject) => {
            this.runQueue({
                type,
                query,
                params: params || [],
                resolve,
                reject
            });
        });
    }




    async run<K extends keyof QueryName["run"]>(id: K, params?: QueryName["run"][K]):Promise<sqlite3.RunResult> {
        return this.execute('run', DB.fromId(id, 'run'), params);
    }

    async exec<K extends keyof QueryName["exec"]>(id: keyof QueryName["exec"], params?: QueryName["exec"][K]):Promise<sqlite3.RunResult> {
        return this.execute('exec', DB.fromId(id, 'exec'), params);
    }

    async get<K extends keyof QueryName["get"]>(id: keyof QueryName["get"], params?: QueryName["get"][K]):Promise<any> {
        return this.execute('get', DB.fromId(id, 'get'), params);
    }

    async all<K extends keyof QueryName["all"]>(id: keyof QueryName["all"], params?: QueryName["all"][K]):Promise<any[]> {
        return this.execute('all', DB.fromId(id, 'all'), params);
    }

    async each<K extends keyof QueryName["each"]>(id: keyof QueryName["each"], params?: QueryName["each"][K]):Promise<any> {
        return this.execute('each', DB.fromId(id, 'each'), params);
    }

    /**
     * Unsafe functions that allow you to write sql directly in your code
     * 
     * Do not use these unless you have to!
     */
    get unsafe(): {
        run: (query: string, params?: QueryParam[]) => Promise<sqlite3.RunResult>;
        exec: (query: string, params?: QueryParam[]) => Promise<sqlite3.RunResult>;
        get: (query: string, params?: QueryParam[]) => Promise<any>;
        all: (query: string, params?: QueryParam[]) => Promise<any[]>;
        each: (query: string, params?: QueryParam[]) => Promise<any>;
    } {
        return {
            run: async (query: string, params?: QueryParam[]) => {
                return this.execute('run', query, params);
            },
            exec: async (query: string, params?: QueryParam[]) => {
                return this.execute('exec', query, params);
            },
            get: async (query: string, params?: QueryParam[]) => {
                return this.execute('get', query, params);
            },
            all: async (query: string, params?: QueryParam[]) => {
                return this.execute('all', query, params);
            },
            each: async (query: string, params?: QueryParam[]) => {
                return this.execute('each', query, params);
            }
        }
    }


    async info(): Promise<TableInfo[]> {
        // to avoid files.js being run at the main.js time
        const { getJSON } = require('./files');
        const tableData = await getJSON('/tables');

        const tables = await MAIN.all('tables');

        return Promise.all(tables.map(async({ name }) => {
            const data = await MAIN.unsafe.all(`PRAGMA table_info(${name})`);
            return {
                table: name,
                data: tableData[name],
                columns: data.map(d => {
                    return {
                        name: d.name,
                        type: d.type,
                        jsType: tableData[name]?.columns[d.name]?.type,
                        description: tableData[name]?.columns[d.name]?.description,
                        notnull: d.notnull
                    }
                })
            }
        }));
    }
}




type TableInfo = {
    table: string;
    data: any;
    columns: {
        name: string;
        type: string;
        jsType: string;
        description: string;
        notnull: number;
    }[]
}



export const MAIN = new DB('main');