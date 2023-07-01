import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';


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
                console.error('Error running tsc: ', err);
                rej();
            });


            child.stdout.on('data', (data) => {
                console.log(data.toString());
            });

            child.stderr.on('data', (data) => {
                console.error(data.toString());
            });

            child.on('close', () => {
                console.log('Script compiled');
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
            if (!main) throw new Error('No main function found in ' + script + '.js');
            main();
        } catch (e) {
            console.error('Error running script: ', e);
        }
    })
    .catch(console.error);