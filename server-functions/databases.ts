import * as sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import * as path from 'path';
import * as fs from 'fs';

type Resolve<T> = (value?: T | PromiseLike<T>) => void;
type Reject = (reason?: any) => void;


enum QueryType {
    exec = 'exec',
    get = 'get',
    all = 'all',
    each = 'each',
    run = 'run'
}

type Param = (string|number|boolean|null|undefined);

class Query {
    type: QueryType;
    query: string;
    params: Param[];
    resolve: Resolve<any>;
    reject: Reject;

    constructor(type: QueryType, query: string, resolve: Resolve<any>, reject: Reject, params?: any[]) {
        this.type = type;
        this.query = query;
        this.params = params || [];
        this.resolve = resolve;
        this.reject = reject;
    }
}

export class DB {
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
            case QueryType.exec:
                data = await this.db?.exec(query.query, query.params);
                break;
            case QueryType.get:
                data = await this.db?.get(query.query, query.params);
                break;
            case QueryType.all:
                data = await this.db?.all(query.query, query.params);
                break;
            case QueryType.each:
                data = await this.db?.each(query.query, query.params);
                break;
            case QueryType.run:
                data = await this.db?.run(query.query, query.params);
                break;
        }

        return data;
    }

    async run(query: string, params?: Param[]):Promise<sqlite3.RunResult> {
        return new Promise((resolve, reject) => {
            this.runQueue(new Query(QueryType.run, query, resolve, reject, params));
        });
    }

    async exec(query: string, params?: Param[]):Promise<sqlite3.RunResult> {
        return new Promise((resolve, reject) => {
            this.runQueue(new Query(QueryType.exec, query, resolve, reject, params));
        });
    }

    async get(query: string, params?: Param[]):Promise<any> {
        return new Promise((resolve, reject) => {
            this.runQueue(new Query(QueryType.get, query, resolve, reject, params));
        });
    }

    async all(query: string, params?: Param[]):Promise<any[]> {
        return new Promise((resolve, reject) => {
            this.runQueue(new Query(QueryType.all, query, resolve, reject, params));
        });
    }

    async each(query: string, params?: Param[]):Promise<any> {
        return new Promise((resolve, reject) => {
            this.runQueue(new Query(QueryType.each, query, resolve, reject, params));
        });
    }


    async info(): Promise<any> {
        // to avoid files.js being run at the main.js time
        const { getJSON } = require('./files');
        const tableData = await getJSON('/tables');
        const query = `
            SELECT name
            FROM sqlite_schema
            WHERE 
                type ='table' AND 
                name NOT LIKE 'sqlite_%';
        `;

        const tables = await MAIN.all(query);

        return Promise.all(tables.map(async({ name }) => {
            const data = await MAIN.all(`PRAGMA table_info(${name})`);
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


export const MAIN = new DB('main');