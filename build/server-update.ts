import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { DB, MAIN } from '../server-functions/databases';
import * as path from 'path';
import * as fs from 'fs';
import { config } from 'dotenv';
import ts from 'typescript';
import { spawn } from 'child_process';

enum Colors {
    Reset = '\x1b[0m',
    Bright = '\x1b[1m',
    Dim = '\x1b[2m',
    Underscore = '\x1b[4m',
    Blink = '\x1b[5m',
    Reverse = '\x1b[7m',
    Hidden = '\x1b[8m',
    
    FgBlack = '\x1b[30m',
    FgRed = '\x1b[31m',
    FgGreen = '\x1b[32m',
    FgYellow = '\x1b[33m',
    FgBlue = '\x1b[34m',
    FgMagenta = '\x1b[35m',
    FgCyan = '\x1b[36m',

    BgBlack = '\x1b[40m',
    BgRed = '\x1b[41m',
    BgGreen = '\x1b[42m',
    BgYellow = '\x1b[43m',
    BgBlue = '\x1b[44m',
    BgMagenta = '\x1b[45m',
    BgCyan = '\x1b[46m'
}


const log = (...args: any[]) => {
    console.log(Colors.FgGreen, '[Server-Update.ts]', Colors.Reset, ...args);
};

const error = (...args: any[]) => {
    console.error(Colors.FgRed, '[Server-Update.ts]', Colors.Reset, ...args);
};

config();

const args = workerData?.args || process.argv.slice(2);
log('Update args:', args);
log('\x1b[41mThis may take a few seconds, please wait...\x1b[0m');

const runTs = async (filePath: string): Promise<any> => {
    return new Promise(async (res, rej) => {
        const child = spawn('tsc', [], {
            stdio: 'pipe',
            shell: true,
            cwd: filePath,
            env: process.env
        });

        child.on('error', error);
        child.stdout.on('data', (data) => {
            log(data.toString());
        });

        child.stderr.on('data', (data) => {
            error(data.toString());
        });

        child.on('close', () => {   
            res(null);
        });
    });
}

// get json file and removes comments
const getJSON = (file: string): any => {
    let p: string;
    if (file.includes('/') || file.includes('\\')) {
        p = file;
    }
    else
        p = path.resolve(__dirname, '../jsons', file + '.json');
    p = path.resolve(__dirname, p);
    if (!fs.existsSync(p)) {
        return false;
    }
    let content = fs.readFileSync(p, 'utf8');
    // remove all /* */ comments
    content = content.replace(/\/\*[\s\S]*?\*\//g, '');
    // remove all // comments
    content = content.replace(/\/\/ .*/g, '');
    try {
        return JSON.parse(content);
    }
    catch (e) {
        error('Error parsing JSON file: ' + file, e);
        return false;
    }
}


// make files and folders if they don't exist
const folders: string[] = [
    '../history'
];


for (const folder of folders) {
    const p = path.resolve(__dirname, folder);
    if (!fs.existsSync(p)) {
        fs.mkdirSync(p);
    }
}

if (!fs.existsSync(path.resolve(__dirname, '../history/manifest.txt'))) {
    fs.writeFileSync(path.resolve(__dirname, '../history/manifest.txt'), JSON.stringify({
        lastUpdate: Date.now(),
        updates: []
    }, null, 4));
}



// creates database if it doesn't exist
export async function initDB() {
    log('Checking to see if database exists...');

    if (fs.existsSync(path.resolve(__dirname, '../db/main.db'))) {
        return log('Database exists! :)');
    }

    log('Database does not exist, creating...');

    fs.writeFileSync(path.resolve(__dirname, '../db/main.db'), '');
    const db = new DB('main');

    await db.init();
}


enum TableStatus {
    EXISTS,
    DOES_NOT_EXIST,
    ERROR,
    NO_COLUMNS,
    SUCCESS
}

// builds tables if they don't exist
async function tableTest(): Promise<{
    [key: string]: TableStatus
}[]> {
    log('Checking to see if all tables exist...');

    const tables = getJSON('tables');

    return Promise.all(Object.entries(tables as {
        [key: string]: Table
    }).map(async ([tableName, table]) => {
        const result = await createTable(tableName, table);
        return {
            [tableName]: result
        }
    }));
}

type ColumnType = 'json' | 'string' | 'number' | 'boolean' | 'date';

type Table = {
    columns: {
        [key: string]: {
            type: ColumnType;
            primaryKey?: boolean;
            description: string;
            init: string;
            default?: string;
            jsonType?: string;
        }
    },
    rows: [],
    description: string;
}


async function createTable(tableName: string, table: Table): Promise<TableStatus> {
    const { columns, rows, description } = table;
    const MAIN = new DB('main');

    const makeTableQuery = `
        CREATE TABLE IF NOT EXISTS "${tableName}" (
            rowId INTEGER PRIMARY KEY AUTOINCREMENT,
            ${Object.entries(table.columns).map(([columnName, { init }]) => `"${columnName}" ${init}`).join(',\n')}
        );
    `;

    await MAIN.run(makeTableQuery);

    if (!columns) return TableStatus.NO_COLUMNS;


    // ensure all columns exist
    const pragmaQuery = `
        PRAGMA table_info("${tableName}");
    `;

    const pragmaResult = await MAIN.all(pragmaQuery);

    await Promise.all(Object.entries(columns).map(([columnName, {init}]) => {
        const columnExists = pragmaResult.find(({ name }) => name === columnName);
        if (columnExists) return TableStatus.EXISTS;

        log(`Column ${columnName} does not exist in table ${tableName}, creating column`);
        const query = `
            ALTER TABLE "${tableName}"
            ADD COLUMN "${columnName}" ${init}
        `;

        return MAIN.run(query);
    }));

    if (!rows) return TableStatus.SUCCESS;

    // adds rows to the table
    await Promise.all(rows.map(async (row) => {
        const primaryKey = Object.keys(columns).find(columnName => columns[columnName].primaryKey);

        if (!primaryKey) {
            log(`Table ${tableName} does not have a primary key, cannot insert row`);
            return;
        }

        const query = `
            SELECT ${primaryKey}
            FROM "${tableName}"
            WHERE "${primaryKey}" = ?
        `;

        const result = await MAIN.get(query, [row[primaryKey]]);

        if (result) {
            log(`Row with primary key ${row[primaryKey]} already exists in table ${tableName}, checking for updates...`);

            // if the row exists, check if it needs to be updated
            if (!Object.keys(row).every(columnName => row[columnName] === result[columnName])) {
                const deleteQuery = `
                    DELETE FROM "${tableName}"
                    WHERE "${primaryKey}" = ?
                `;

                await MAIN.run(deleteQuery, [row[primaryKey]]);

                const insertQuery = `
                    INSERT INTO "${tableName}" (${Object.keys(row).map(k => `"${k}"`).join(', ')})
                    VALUES (${Object.keys(row).map(() => '?').join(', ')})
                `;

                await MAIN.run(insertQuery, Object.keys(row).map(k => {
                    const { type } = columns[k];

                    if (type === 'json') return JSON.stringify(row[k]);
                    return row[k];
                }));

                return;
            }
        } else {
            log(`Row with primary key ${row[primaryKey]} does not exist in table ${tableName}, inserting row...`);

            const query = `
                INSERT INTO "${tableName}" (${Object.keys(row).map(k => `"${k}"`).join(', ')})
                VALUES (${Object.keys(row).map(() => '?').join(', ')})
            `;

            await MAIN.run(query, Object.keys(row).map(k => {
                const { type } = columns[k];

                if (type === 'json') return JSON.stringify(row[k]);
                return row[k];
            }));
        }
    }));


    return TableStatus.SUCCESS;
}

type Manifest = {
    lastUpdate: number;
    updates: {
        name: string;
        date: number;
    }[];
}

// run database updates
async function runUpdates(updates: Update[]) {
    log('Checking for database updates...');

    const manifest = JSON.parse(
        fs.readFileSync(
            path.resolve(__dirname, "../history/manifest.txt"), 'utf8')
        ) as Manifest;

    const { lastUpdate, updates: doneUpdates } = manifest;

    log('Last update:', new Date(lastUpdate).toLocaleString());

    manifest.updates.push(...((await Promise.all(updates.map(async update => {
        const { name, description, test, execute } = update;

        const result = await test(new DB('main'));

        if (result) {
            log(`Running update ${name}...`);
            try {
                await execute(new DB('main'));
            } catch (e) {
                log(`Error running update ${name}:`, e);
                return;
            }
            return {
                name,
                date: Date.now()
            }
        }
    }))).filter(Boolean) as { name: string, date: number }[]));

    fs.writeFileSync(path.resolve(__dirname, "../history/manifest.txt"), JSON.stringify(manifest, null, 4));
}

// generates a backup of the database
function makeBackup() {
    log('Backing up database...');

    const newDB = path.resolve(__dirname, '../history', `${Date.now()}.db`);

    fs.copyFileSync(path.resolve(__dirname, '../db/main.db'), newDB);
}

// cannot use setTimeout because the integer may overflow
const daysTimeout = (cb: () => void, days: number) => {
    const day = 1000 * 60 * 60 * 24;

    let numDays = 0;
    const int = setInterval(() => {
        numDays++;
        if (numDays >= days) {
            cb();
            numDays = 0;
            clearInterval(int);
        }
    }, day);
}


// deletes database backups after 7 days
function setBackupIntervals() {
    log('Setting backup intervals...');

    const files = fs.readdirSync(path.resolve(__dirname, '../history'));

    for (const file of files) {
        if (file === 'manifest.txt') continue;

        const p = path.resolve(__dirname, '../history', file);

        const now = new Date();
        const fileDate = new Date(parseInt(file.replace('.db', '')));
        const diff = now.getTime() - fileDate.getTime();
        const days = Math.floor(7 - (diff / (1000 * 60 * 60 * 24)));

        const deleteFile = () => {
            log('Deleting file:', p);
            fs.unlinkSync(p);
        }

        daysTimeout(deleteFile, days);
    }
}

// wrapper for running functions
const runFunction = async(fn: () => any|Promise<any>) => {
    const now = Date.now();
    try {
        await fn();
    } catch (e) {
        error('Error running function:', fn.name);
        error(e);
        return;
    }

    log('Finished running function:', fn.name, 'in', Date.now() - now, 'ms');
}

// creates .env file if it doesn't exist
const initEnv = () => {
    if (fs.existsSync(path.resolve(__dirname, '../.env'))) return;
    log('Creating .env file...');
    fs.writeFileSync(path.resolve(__dirname, '../.env'), `
        PORT="3000"
        DB_KEY=""
        DOMAIN="http://localhost:3000"
        
        SENDGRID_API_KEY=""

        AUTO_SIGN_IN_USERNAME=""

        ID_GENERATION_LINK=""
        ID_GENERATION_KEY=""
    `);
}



// entry point
export const serverUpdate = async () => {
    try {
        await runTs(path.resolve(__dirname, './updates'));
    } catch (e) {}
    
    const updates: Update[] = fs.readdirSync(path.resolve(__dirname, './updates')).map(file => {
        if (file.endsWith('.js')) {
            file = file.replace('.js', '');
            log('Imported update:', file);
            return require('./tests' + file) as Update;
        }
    }).filter(Boolean) as Update[];

    function updateTests() {
        return runUpdates(updates);
    }

    await runFunction(initEnv);
    await runFunction(initDB);
    await runFunction(tableTest);
    await runFunction(updateTests);

    if (args.includes('all') || args.includes('backup')) {
        await runFunction(makeBackup);
    }

    await runFunction(setBackupIntervals);

    return log('Finished running server update');
}


if (args.includes('main')) {
    serverUpdate()
        .then(() => {
            parentPort?.postMessage('update-complete');
        })
        .catch(e => {
            log('Error running server update:', e);
            parentPort?.postMessage('update-error');
        });
}


export type Update = {
    name: string;
    description: string;
    test: (database: DB) => Promise<boolean>;
    execute: (database: DB) => Promise<void>;
}