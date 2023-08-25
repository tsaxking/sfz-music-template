import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';



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
    console.log(Colors.FgCyan, '[Scripts.ts]', Colors.Reset, ...args);
};

const error = (...args: any[]) => {
    console.error(Colors.FgRed, '[Scripts.ts]', Colors.Reset, ...args);
};



const [,,script] = process.argv;

if (!script) throw new Error('No script provided');


const ts = async (): Promise<void> => {
    return new Promise(async (res, rej) => {
        try {
            const child = spawn('tsc', [], {
                stdio: 'pipe',
                shell: true,
                cwd: __dirname,
                env: process.env
            });

            child.on('error', (err) => {
                error('Error running tsc: ', err);
                rej();
            });


            child.stdout.on('data', (data) => {
                log(data.toString());
            });

            child.stderr.on('data', (data) => {
                error(data.toString());
            });

            child.on('close', () => {
                log('Script compiled');
                res();
            });
        } catch { 
            rej();
        }
    });
}

ts()
    .then(async() => {
        try {
            const { main } = require(path.resolve(__dirname, script + '.js'));
            if (!main) {
                return error('No main function found in ' + script + '.ts', 'Please export a function called main');
            }
            main();
        } catch (e) {
            error('Error running script: ', e);
        }
    })
    .catch(error);