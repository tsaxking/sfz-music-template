import { MAIN, LIB } from '../../databases';
import { getUpload } from '../../files';
import { cleanseSQL } from '../../structure/sql';
import { uuid } from '../../structure/uuid';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import csv from 'csv-parser';
import { XMLParser, XMLBuilder, XMLValidator } from 'fast-xml-parser';




export enum HeaderType {
    number = 'number',
    string = 'string',
    boolean = 'boolean',
    date = 'date',
    unknown = 'unknown'
}

type MainLibrary = {
    name: string,
    dateCreated: string,
    active: boolean,
    id: string
}

const sqlType = (type: HeaderType) => {
    let sql: string;
    switch (type) {
        case HeaderType.number:
            sql = 'INTEGER';
            break;
        case HeaderType.string:
            sql = 'TEXT';
            break;
        case HeaderType.boolean:
            sql = 'INTEGER';
            break;
        default:
            sql = 'INVALID';
            break;
    }

    return sql;
}



enum HeaderResult {
    noHeader = 'noHeader',
    success = 'success',
    duplicateHeader = 'duplicateHeader',
    invalidType = 'invalidType',
    invalidName = 'invalidName'
}

export enum LibraryStatus {
    notFound = 'notFound',
    success = 'success',
    unknown = 'unknown',


    invalidFile = 'invalidFile',
    notJSONArray = 'notJSONArray'
}



export class Library {
    static async new(name: string) {
        const insertQuery = `
            INSERT INTO Libraries (
                name,
                dateCreated,
                active,
                id
            )
            VALUES (
                ?, ?, ?, ?
            )
        `;

        const id = await Library.newId();

        const params = [
            name,
            Date.now(),
            true,
            id
        ];


        const newLibQuery = `
            CREATE TABLE IF NOT EXISTS "${id}_Pieces" (
                rowid INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT,
                composer TEXT,
                _dateCreated TEXT,
                _checkedIn INTEGER,
                _id TEXT UNIQUE NOT NULL,
                _pdfs TEXT,
                _info TEXT
            )
        `;

        const newVersionLibQuery = `
            CREATE TABLE IF NOT EXISTS "${id}_Versions" (
                rowid INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT,
                composer TEXT,
                _dateCreated TEXT,
                _checkedIn INTEGER,
                _id TEXT UNIQUE NOT NULL,
                _pdfs TEXT,
                _info TEXT,
                _version INTEGER NOT NULL
            )
        `;

        const newArchiveQuery = `
            CREATE TABLE IF NOT EXISTS "${id}_Archive" (
                rowid INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT,
                composer TEXT,
                _dateCreated TEXT,
                _checkedIn INTEGER,
                _id TEXT UNIQUE NOT NULL,
                _pdfs TEXT,
                _info TEXT
            )
        `;

        await Promise.all([
            MAIN.run(insertQuery, params),
            LIB.run(newLibQuery),
            LIB.run(newVersionLibQuery),
            LIB.run(newArchiveQuery)
        ]);

        const l = new Library(id);
        await l.init();
        return l;
    }

    static async newId(): Promise<string> {
        let id: string;
        do {
            id = uuid({
                letters: true
            });
        } while (await Library.exists(id));
        return id;
    }

    static async exists(id: string) {
        const query = `
            SELECT COUNT(*) as count
            FROM Libraries
            WHERE id = ?
        `;

        const result = await MAIN.get(query, [id]) as { 'count': number };
        return result?.count > 0;
    }

    static async fromId(id: string): Promise<{ library?: Library, status: LibraryStatus }> {
        if (!await Library.exists(id)) return { status: LibraryStatus.notFound };

        const l = new Library(id);
        await l.init();
        return { library: l, status: LibraryStatus.success };
    }

    id: string;
    #headers: string[] = [];
    #name: string = '';
    #dateCreated: string = '';
    #active: boolean = false;

    constructor(id: string) {
        this.id = id;
    }


    async getData() {
        const sizeQuery = `
            SELECT COUNT(*) as count
            FROM "${this.id}_Pieces"
        `;

        const size = await LIB.get(sizeQuery) as { count: number };

        return {
            headers: this.headers,
            name: this.name,
            length: size.count
        }
    }


    get allHeaders() {
        return this.#headers;
    }

    get headers() {
        return this.allHeaders.filter(header => !header.startsWith('__'));
    }

    get archivedHeaders() {
        return this.allHeaders.filter(header => header.startsWith('__'));
    }

    get customHeaders() {
        return this.headers.filter(header => !header.startsWith('_'));
    }

    get systemHeaders() {
        return this.headers.filter(header => header.startsWith('_'));
    }

    set headers(headers: string[]) {
        console.error('Cannot set headers directly. Use addHeader, renameHeader, or deleteHeader.');
    }




    get name() {
        return this.#name;
    }

    set name(name: string) {
        console.error('Cannot set name directly. Use setName().');
    }

    async setName(name: string) {
        const query = `
            UPDATE Libraries
            SET name = ?
            WHERE id = ?
        `;

        this.#name = name;
        await MAIN.run(query, [name, this.id]);
    }

    get dateCreated() {
        return this.#dateCreated;
    }

    set dateCreated(dateCreated: string) {
        console.error('Date created is immutable.');
    }

    get active() {
        return this.#active;
    }

    set active(active: boolean) {
        console.error('Cannot set active directly. Use setActive().');
    }

    async setActive(active: boolean) {
        const query = `
            UPDATE Libraries
            SET active = ?
            WHERE id = ?
        `;
        this.#active = active;
        await MAIN.run(query, [active, this.id]);
    }

    async init() {
        await Promise.all([
            this.initHeaders(),
            this.initData()
        ]);
    }

    private async initHeaders() {
        const query = `
            PRAGMA table_info("${this.id}")
        `;

        type Header = {
            cid: number,
            name: string,
            type: string,
            notnull: number,
            dflt_value: string,
            pk: number
        }

        const headers = await LIB.all(query) as Header[];

        this.#headers = headers.map((header: any) => header.name);
    }

    private async initData() {
        const query = `
            SELECT *
            FROM Libraries
            WHERE id = ?
        `;

        const { name, dateCreated, active } = await MAIN.get(query, [this.id]) as MainLibrary;

        this.#name = name;
        this.#dateCreated = dateCreated;
        this.#active = active;
    }

    async addHeader(header: string, type: HeaderType) {
        const sql = sqlType(type);

        if (sql === 'INVALID') return HeaderResult.invalidType;

        if (header.startsWith('_')) {
            return HeaderResult.invalidName;
        }

        const query = `
            ALTER TABLE "${this.id}"
            ADD COLUMN "${cleanseSQL(header)}" ${sql}
        `;

        await LIB.run(query);
        await this.initHeaders();

        return HeaderResult.success;
    }

    async renameHeader(header: string, newHeader: string) {
        if (!this.allHeaders.includes(header)) return HeaderResult.noHeader;
        if (this.allHeaders.includes(newHeader)) return HeaderResult.duplicateHeader;


        if (newHeader[0] === '_') {
            if (newHeader.slice(0, 2) === '__') {
                if (this.archivedHeaders.includes(newHeader)) return HeaderResult.duplicateHeader;
            } else {
                return HeaderResult.invalidName;
            }
        }
        const query = `
            ALTER TABLE "${this.id}"
            RENAME COLUMN "${cleanseSQL(header)}"
            TO "${cleanseSQL(newHeader)}"
        `;

        await LIB.run(query);
        await this.initHeaders();
        return HeaderResult.success;
    }

    async deleteHeader(header: string) {
        return this.renameHeader(header, '__' + header);
    }

    async renewHeader(header: string) {
        return this.renameHeader('__' + header, header);
    }


    async addPieces(...pieces: any[]) {
        type Header = {
            name: string;
            type: HeaderType;
        }

        const headers: Header[] = pieces.reduce((acc: Header[], piece: any) => {
            if (typeof piece !== 'object') return acc;
            return acc.concat(Object.keys(piece).map((h: string) => {
                const type = typeof piece[h];
                return {
                    name: h,
                    type: type === 'number' ? HeaderType.number :
                        type === 'string' ? HeaderType.string :
                        type === 'boolean' ? HeaderType.boolean :
                        HeaderType.unknown
                }
            }));
        }, [] as Header[]);

        await Promise.all(headers.map(async ({ name, type }) => {
            if (!this.allHeaders.includes(name)) {
                await this.addHeader(name, type);
            }
        }));

        await Promise.all(pieces.map(async (piece: any) => {
            try {
                const keys = Object.keys(piece);
                const values = Object.values(piece);
        
                const query = `
                    INSERT INTO "${this.id}"
                    (${keys.map(cleanseSQL).join(', ')})
                    VALUES
                    (${keys.map(() => '?').join(', ')})
                `;
        
                await LIB.run(query, values);
            } catch {
                console.error(new Error('Failed to add piece: \n' + JSON.stringify(piece, null, 4)));
            }
        }));

        return LibraryStatus.success;
    }


    async fromJSON(uploadId: string): Promise<LibraryStatus> {
        const json = await getUpload(uploadId)
            .catch(() => null);
        if (!json) return LibraryStatus.invalidFile;

        let arr: any[];
        try {
            arr = JSON.parse(json) as any[];
        } catch {
            return LibraryStatus.invalidFile;
        }

        if (!Array.isArray(arr)) {
            return LibraryStatus.notJSONArray;
        }

        return this.addPieces(...arr);
    }

    async fromCSV(csvPath: string): Promise<LibraryStatus> {
        return new Promise((res) => {
            const results: any[] = [];
            fs.createReadStream(csvPath)
                .pipe(csv())
                .on('data', async (piece: any) => {
                    results.push(piece);
                })
                .on('end', async () => {
                    res(await this.addPieces(...results));
                })
                .on('error', (err: any) => {
                    res(LibraryStatus.invalidFile);
                });
        });
    }

    async fromTSV(tsvPath: string): Promise<LibraryStatus> {
        return new Promise((res) => {
            const results: any[] = [];
            fs.createReadStream(tsvPath)
                .pipe(csv({
                    separator: '\t'
                }))
                .on('data', async (piece: any) => {
                    results.push(piece);
                })
                .on('end', async () => {
                    res(await this.addPieces(...results));
                })
                .on('error', (err: any) => {
                    res(LibraryStatus.invalidFile);
                });
        });
    }

    async fromXML(xmlPath: string): Promise<LibraryStatus> {
        try {
            const parser = new XMLParser({
                attributeNamePrefix: '',
                ignoreAttributes: false,
                parseAttributeValue: true
            });

            const xml = await fsPromises.readFile(xmlPath, 'utf8')
                .catch(() => null);

            if (!xml) return LibraryStatus.invalidFile;



            const json = parser.parse(xml);

            if (!json) return LibraryStatus.invalidFile;

            const pieces: (any[] | any | undefined) = json?.pieces?.piece;

            if (!pieces || !Array.isArray(pieces)) return LibraryStatus.invalidFile;

            return this.addPieces(...pieces);
        } catch (e) {
            console.error(e);
            return LibraryStatus.invalidFile;
        }
    }
}

