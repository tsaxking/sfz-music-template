// used for changing text color in console
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


// [Main.ts] Logging
const log = (...args: any[]) => {
    console.log(Colors.FgMagenta, '[Main.ts]', Colors.Reset, ...args);
};

const error = (...args: any[]) => {
    console.error(Colors.FgRed, '[Main.ts]', Colors.Reset, ...args);
};



const __arguments = process.argv.slice(2);
log('Arguments:', __arguments.map(a => Colors.FgGreen + a + Colors.Reset).join(' '));
let [env, ...args] = __arguments;


type Mode = {
    type: string;
    description: string;
    command: string;
    quickInfo: string[];
}






import { Worker, isMainThread, workerData, parentPort } from 'worker_threads';
import * as path from 'path';
import { spawn } from 'child_process';
import * as ts from 'typescript';
import '@total-typescript/ts-reset';
import * as os from 'os';
import { config } from 'dotenv';
import { buildServerFunctions, doBuild, onFileChange, stopWorkers, watchIgnoreDirs, watchIgnoreList, renderedBuilds } from './build/build';
import * as chokidar from 'chokidar';
import setTitle from 'node-bash-title';

setTitle('Starting...');

config();


let server: Worker;

const newServer = async () => {
    try {
        setTitle(`🎷 [${env}] sfzMusic Server`);
        console.log('---------------------------------------------');
        log('Starting server...');
        log('Run "help" to view available commands');
        log('Listening for .ts and .json file changes...');
        console.log('---------------------------------------------');

        if (server) await server.terminate();
        await Promise.all([
            runTs('./server.ts')
        ]);

        server = new Worker(path.resolve(__dirname, 'server.js'), {
            workerData: {
                mode: process.argv[2],
                args: [env, process.argv.slice(3)],
                builds: renderedBuilds,
                io: undefined
            }
        });

        server.on('error', (err) => {
            // log('Server error:', err);
            log(Colors.FgRed, 'Server error:', err, Colors.Reset);
            log(Colors.FgBlue, 'Please fix the error and restart', Colors.Reset);
            // server.terminate();
        });
    } catch (err) {}
}

// build server functions and restarts the server
const build = async() => {
    setTitle('Building...');

    if (server) await server.terminate();
    await stopWorkers(); // kills all current build workers
    const start = Date.now();

    await Promise.all([
        doBuild(env),
        buildServerFunctions()
    ]);
    log('Build complete in', Date.now() - start, 'ms');

    newServer();
    startWatchProgram();
};


// if multiple files are saved during the build process, it will build multiple times, but it will only restart the server once
// the build buffer is used to keep track of how many rebuilds are currently running
let buildBuffer: Promise<any>[] = [];
let watchStarted: boolean = false;
const startWatchProgram = () => {
    if (args.includes('no-watch')) return;

    if (watchStarted) return;
    watchStarted = true;
    const watcher = chokidar.watch(path.resolve(__dirname, '.'), {
        ignored: [
            ...watchIgnoreList,
            ...watchIgnoreDirs
        ],
        ignoreInitial: true,
        persistent: true,
        awaitWriteFinish: {
            stabilityThreshold: 1000,
            pollInterval: 100
        }
    });

    const onChange = (filename: string) => {
        if (!filename) return;
        const validExts = [
            '.ts',
            '.json',
            '.css',
            '.scss',
            '.sass'
        ];

        if (!validExts.includes(path.extname(filename))) return;

        log('File changed:', filename);

        const promise = onFileChange(filename, env);

        // the buffer will fill with promises which could fill up the cache, but this shouldn't impact performance much
        buildBuffer.push(promise);

        // once all builds are completed, restart the server
        if (buildBuffer.length > 1) return;
        Promise.all(buildBuffer).then(() => {
            // should the buffer clear?

            buildBuffer = [];

            log('Build complete');
            newServer();
        }).catch(error);
    };

    watcher.on('change', onChange);
    watcher.on('add', onChange);
    watcher.on('unlink', onChange);
    watcher.on('unlinkDir', onChange);
    watcher.on('addDir', onChange);
};

// used for updating the database and other things
// runs ./build/server-update.ts
const update = async (): Promise<Worker> => {
    setTitle('Updating...');
    return new Promise((res, rej) => {
        const update = new Worker(path.resolve(__dirname, 'build', 'server-update.js'), {
            workerData: {
                args: ['main']
            }
        });


        update.on('message', (msg) => {
            switch (msg) {
                case 'update-complete':
                    log('Update complete');
                    res(update);
                    break;
                case 'update-error':
                    error('There was an error updating the project');
                    break;
                case 'update-warning':
                    console.warn('There was a warning updating the project');
                    break;
            }
        });
        update.on('error', error);
        update.on('exit', (code) => {
            if (code !== 0)
                error(new Error(`Worker stopped with exit code ${code}`));
        });
    });
};

// build ts files
const runTs = async (fileName: string): Promise<void> => {
    const program = ts.createProgram([fileName], {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        allowJs: true,
        checkJs: false,
        forceConsistentCasingInFileNames: true,
        esModuleInterop: true,
        skipLibCheck: true
    });
    const emitResult = program.emit();

    const allDiagnostics = ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics);

    allDiagnostics.forEach(diagnostic => {
        if (diagnostic.file) {
            const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start!);
            const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
            log(`${diagnostic.file.fileName} (${line + 1},${character + 1}): ${message}`);
        } else {
            log(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
        }
    });

    const exitCode = emitResult.emitSkipped ? 1 : 0;

    if (exitCode !== 0) {
        error(new Error('There was an error compiling the project'));
    }

    return;
}



const exit = async (data?: any) => {
    log('Exiting...');
    log('Data:', data);
    if (server) await server.terminate();
    await stopWorkers();

    process.exit(0);
};

process.on('exit', exit);
process.on('SIGINT', exit);
process.on('SIGTERM', exit);
process.on('SIGUSR1', exit);
process.on('SIGUSR2', exit);
process.on('uncaughtException', exit);
process.on('unhandledRejection', exit);

(async() => {
    if (isMainThread) {
        await Promise.all([
            runTs('./build/build.ts'),
            runTs('./build/server-update.ts'),
            runTs('./build/run-ts.ts')
        ]);

        // this currently does not work
        switch (env) {
            case 'update-only':
                await update();
                process.exit(0);
            case 'build-only':
                await doBuild(env);
                process.exit(0);
        }


        // VVVVVVVVVVVVVVVVVVVVVVVVV
        // these are for instructions

        const modes: {
            [key: string]: Mode;
        } = {
            dev: {
                type: 'development',
                description: 'In dev mode, only ts is rendered. This is the mode you should use when debugging and writing code.',
                command: 'npm run dev',
                quickInfo: [
                    `Static Files are ${Colors.FgRed}not${Colors.Reset} combined or minified`,
                    `Debugging is ${Colors.FgGreen}easier${Colors.Reset}`,
                    `Uploads are ${Colors.FgRed}slower${Colors.Reset}`,
                    `Browser window is ${Colors.FgGreen}spawned${Colors.Reset}`
                ]
            },
            test: {
                type: 'testing',
                description: 'This environment is similar to the production environment, but it will still auto login and spawn a browser window.',
                command: 'npm test',
                quickInfo: [
                    `Static Files are ${Colors.FgGreen}combined${Colors.Reset} but not ${Colors.FgRed}minified${Colors.Reset}`,
                    `Debugging is ${Colors.FgRed}more difficult${Colors.Reset}`,
                    `Uploads are ${Colors.FgGreen}faster${Colors.Reset}`,
                    `Browser window is ${Colors.FgGreen}spawned${Colors.Reset}`
                ]
            },
            prod: {
                type: 'production',
                description: `In production, the idea is everything is more optimized. (This is a work in progress).`,
                command: 'npm start',
                quickInfo: [
                    `Static Files are ${Colors.FgGreen}combined${Colors.Reset} and ${Colors.FgGreen}minified${Colors.Reset}`,
                    `Debugging is ${Colors.FgRed}more difficult${Colors.Reset}`,
                    `Uploads are ${Colors.FgGreen}faster${Colors.Reset}`,
                    `Browser window is ${Colors.FgRed}not spawned${Colors.Reset}`
                ]
            }
        }
        console.clear();
        console.log('Starting in', env, 'mode...');
        
        if (process.argv[2] == 'help') {
            log('Hello! Welcome to the help menu, please read the following information carefully.');
            log('Available modes:');
            // in red
            log(Colors.FgGreen + 'all modes run "npm i" && "db-updates.js"' + Colors.Reset);
            for (const mode in modes) {
                // log in colors (type = purple) (command = yellow) (description = white)
        
                log(Colors.FgMagenta, modes[mode].type, Colors.Reset, ':', Colors.FgYellow, `(${modes[mode].command})`, Colors.Reset, '-', modes[mode].description);
                log(modes[mode].quickInfo.map(i => `    ${Colors.BgCyan}-${Colors.Reset} ` + i).join('\n'));
            }
        }
        log(`Currently, you are running in ${Colors.FgMagenta}${modes[process.argv[2]].type} mode.`, Colors.Reset);
        log(modes[process.argv[2]].quickInfo.map(i => `    ${Colors.BgCyan}-${Colors.Reset} ` + i).join('\n'));
        log('Please run "npm run help" to see all the modes available.');


        // ^^^^^^^^^^^^^^^^^^^^^^^^


        if (!args.includes('skip-updates') && !args.includes('skip-update')) await update();
        if (args.includes('skip-build')) await newServer().then(startWatchProgram);
        else await build();

        if (env !== 'prod') {
            const url = 'http://localhost:' + process.env.PORT;
            // get operating system
            const platform = os.platform();

            if (!args.includes('no-browser')) {
                switch (platform) {
                    case 'win32':
                        // windows
                        spawn('start', [url], {
                            cwd: process.cwd(),
                            env: process.env,
                            stdio: 'pipe',
                            shell: true
                        });
                        break;
                    case 'darwin':
                        // mac
                        spawn('open', [url], {
                            cwd: process.cwd(),
                            env: process.env,
                            stdio: 'pipe',
                            shell: true
                        });
                        break;
                    case 'linux':
                        // linux
                        spawn('xdg-open', [url], {
                            cwd: process.cwd(),
                            env: process.env,
                            stdio: 'pipe',
                            shell: true
                        });
                        break;
                    default:
                        error('Unknown operating system');
                        break;
                }
            }
        }








        // Commands

        type Command = {
            description: string;
            fn: (...args: string[]) => void;
        }

        const commands: {
            [key: string]: Command;
        } = {
            update: {
                description: 'Updates the database and other things',
                fn: async () => {
                    await server.terminate();
                    await update();
                    newServer();
                }
            },
            build: {
                description: 'Forces a full rebuild of the project',
                fn: build
            },
            exit: {
                description: 'Exits the process',
                fn: exit
            },
            rs: {
                description: 'Restarts the server',
                fn: newServer
            },
            prod: {
                description: 'Switches to production mode',
                fn: () => {
                    env = 'prod';
                    newServer();
                }
            },
            dev: {
                description: 'Switches to development mode',
                fn: () => {
                    env = 'dev';
                    newServer();
                }
            },
            test: {
                description: 'Switches to testing mode',
                fn: () => {
                    env = 'test';
                    newServer();
                }
            }, 
            help: {
                description: 'Shows this help menu',
                fn: () => {}
            },
            script: {
                description: 'Runs a script from the ./scripts directory. Example: "script test"',
                fn: async (script: string, ...args: string[]) => {
                    log("Running script:", script);

                    await new Promise((res, rej) => {
                        // const worker = new Worker(
                        //     path.resolve(__dirname, './scripts/main.js'),
                        //     {
                        //         workerData: {
                        //             script,
                        //             args,
                        //             env
                        //         }
                        //     }
                        // )





                        const child = spawn('npm run script ' + script + ' ' + args.join(' '), {
                            cwd: __dirname,
                            env: process.env,
                            stdio: 'pipe',
                            shell: true
                        });

                        const childLog = (data: string) => console.log(Colors.FgCyan, '[Script]', Colors.Reset, data.toString().trim());

                        child.stdout.on('data', childLog);
                        child.stderr.on('data', childLog);

                        child.on('close', res);
                        child.on('error', rej);
                        child.on('exit', res);
                        child.on('disconnect', res);
                        child.on('message', childLog);
                    });

                    log('Script complete');
                }
            }
        }

        const help = () => {
            const max = Math.max(...Object.keys(commands).map(c => c.length));

            for (const [command, info] of Object.entries(commands)) {
                log((command + ' ').padEnd(max + 3, '-'),  info.description);
            }
        }

        help();


        // for running commands
        process.stdin.on('data', async (data) => {
            const str = data.toString().trim();

            if (str == 'help') return help();

            const [command, ...args] = str.split(' ');

            if (commands[command]) {
                commands[command].fn(...args);
            }
        });
    }
})();