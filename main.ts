const __arguments = process.argv.slice(2);
console.log('Arguments:', __arguments.map(a => '\x1b[35m' + a + '\x1b[0m').join(' '));
const [env, ...args] = __arguments;

type Mode = {
    type: string;
    description: string;
    command: string;
    quickInfo: string[];
}

const modes: {
    [key: string]: Mode;
} = {
    dev: {
        type: 'development',
        description: 'In dev mode, only ts is rendered. This is the mode you should use when debugging',
        command: 'npm test',
        quickInfo: [
            'Static Files are \x1b[31mnot\x1b[0m combined or minified',
            'Debugging is \x1b[32measier\x1b[0m',
            'Uploads are \x1b[31mslower\x1b[0m',
            'Browser window is \x1b[32mspawned\x1b[0m'
        ]
    },
    test: {
        type: 'testing',
        description: 'This environment is similar to the production environment, but it will still auto login and spawn a browser window.',
        command: 'npm run dev',
        quickInfo: [
            'Static Files are \x1b[32mcombined\x1b[0m but not \x1b[32mminified\x1b[0m',
            'Debugging is \x1b[31mmore difficult\x1b[0m',
            'Uploads are \x1b[32mfaster\x1b[0m',
            'Browser window is \x1b[32mspawned\x1b[0m'
        ]
    },
    prod: {
        type: 'production',
        description: `In production, the idea is everything is more optimized. (This is a work in progress).`,
        command: 'npm start',
        quickInfo: [
            'Static Files are \x1b[32mcombined\x1b[0m and \x1b[32mminified\x1b[0m',
            'Debugging is \x1b[31mmore difficult\x1b[0m',
            'Uploads are \x1b[32mfaster\x1b[0m',
            'Browser window is \x1b[31mnot spawned\x1b[0m'
        ]
    }
}
console.clear();

if (process.argv[2] == 'help') {
    console.log('Hello! Welcome to the help menu, please read the following information carefully.');
    console.log('Available modes:');
    // in red
    console.log('\x1b[32m' + 'all modes run "npm i" && "db-updates.js"' + '\x1b[0m');
    for (const mode in modes) {
        // log in colors (type = purple) (command = yellow) (description = white)

        console.log(`\x1b[35m${modes[mode].type}\x1b[0m: \x1b[33m(${modes[mode].command})\x1b[0m - ${modes[mode].description}`);
        console.log(modes[mode].quickInfo.map(i => '    \x1b[34m-\x1b[0m ' + i).join('\n'));
    }
}
console.log(`Currently, you are running in \x1b[35m${modes[process.argv[2]].type} mode.\x1b[0m`);
console.log(modes[process.argv[2]].quickInfo.map(i => '    \x1b[34m-\x1b[0m ' + i).join('\n'));
console.log('Please run "npm run help" to see all the modes available.');





import { Worker, isMainThread, workerData, parentPort } from 'worker_threads';
import * as path from 'path';
import { spawn } from 'child_process';
import * as ts from 'typescript';
import '@total-typescript/ts-reset';
import * as os from 'os';
import { config } from 'dotenv';
import { buildServerFunctions, doBuild, onFileChange, stopWorkers, watchIgnoreDirs, watchIgnoreList, renderedBuilds } from './build/build';
import * as chokidar from 'chokidar';

config();


let server: Worker;

const newServer = async () => {
    if (server) server.terminate();
    await Promise.all([
        runTs('./server.ts')
    ]);

    server = new Worker(path.resolve(__dirname, 'server.js'), {
        workerData: {
            mode: process.argv[2],
            args: process.argv.slice(3),
            builds: renderedBuilds
        }
    });

    server.on('error', (err) => {
        console.log('Server error:', err);
        console.log('Please make changes and save to restart the server.');
        server.terminate();
    });
}

const build = async() => {
    if (server) server.terminate();
    stopWorkers(); // kills all current build workers
    const start = Date.now();

    await Promise.all([
        doBuild(),
        buildServerFunctions()
    ]);
    console.log('Build complete in', Date.now() - start, 'ms');

    newServer();
    startWatchProgram();
};

let buildTimeout: NodeJS.Timeout | undefined;
let watchStarted = false;
const startWatchProgram = () => {
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
            '.json'
        ];

        if (!validExts.includes(path.extname(filename))) return;

        console.log('File changed:', filename);
        
        // in case of multiple changes, only build once
        if (buildTimeout) clearTimeout(buildTimeout);
        buildTimeout = setTimeout(() => {
            // onFileChange(filename);
            build();
        }, 1000);
    };

    watcher.on('change', onChange);
    watcher.on('add', onChange);
    watcher.on('unlink', onChange);
    watcher.on('unlinkDir', onChange);
    watcher.on('addDir', onChange);
};


const update = async (): Promise<Worker> => {
    return new Promise((res, rej) => {
        const update = new Worker(path.resolve(__dirname, 'build', 'server-update.js'), {
            workerData: {
                args: ['main']
            }
        });


        update.on('message', (msg) => {
            switch (msg) {
                case 'update-complete':
                    console.log('Update complete');
                    res(update);
                    break;
                case 'update-error':
                    console.error('There was an error updating the project');
                    break;
                case 'update-warning':
                    console.warn('There was a warning updating the project');
                    break;
            }
        });
        update.on('error', console.error);
        update.on('exit', (code) => {
            if (code !== 0)
                console.error(new Error(`Worker stopped with exit code ${code}`));
        });
    });
};


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
            console.log(`${diagnostic.file.fileName} (${line + 1},${character + 1}): ${message}`);
        } else {
            console.log(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
        }
    });

    const exitCode = emitResult.emitSkipped ? 1 : 0;

    if (exitCode !== 0) {
        throw new Error('There was an error compiling the project');
    }

    return;
}

(async() => {
    if (isMainThread) {
        await Promise.all([
            runTs('./server-functions'),
            runTs('./build/build.ts'),
            runTs('./build/server-update.ts')
        ]);


        await update();
        build();

        if (env !== 'prod') {
            const url = 'http://localhost:' + process.env.PORT;
            // get operating system
            const platform = os.platform();
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
                    console.error('Unknown operating system');
                    break;
            }
        }

        process.stdin.on('data', (data) => {
            switch(data.toString().trim()) {
                case 'update':
                    server.terminate();
                    update(); // forces full update
                    newServer();
                    break;
                case 'build':
                    build(); // forces full rebuild
                    break;
                case 'exit':
                    process.exit(0);
                case 'rs':
                    server.terminate();
                    newServer();
                    break;
            }
        });
    }
})();