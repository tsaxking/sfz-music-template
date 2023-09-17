import * as fs from 'fs';
import * as path from 'path';
import UglifyJS from 'uglify-js';
import postcss from 'postcss';
import cssnano from 'cssnano';
import autoprefixer from 'autoprefixer';
import axios from 'axios';
import ChildProcess, { spawn } from 'child_process';
import sass from 'sass';
// import { compile } from '@gerhobbelt/gitignore-parser';
import { Worker, isMainThread, workerData, parentPort } from 'worker_threads';
import ts, { CompilerOptions } from 'typescript';
import * as chokidar from 'chokidar';

const fsPromises = fs.promises;

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
    console.log(Colors.FgBlue, '[Build.ts]', Colors.Reset, ...args);
};

const error = (...args: any[]) => {
    console.error(Colors.FgRed, '[Build.ts]', Colors.Reset, ...args);
};



export const watchIgnoreList = [
    path.resolve(__dirname, '../package.json'),
    path.resolve(__dirname, '../package-lock.json'),
    path.resolve(__dirname, './tsconfig.json'),
    path.resolve(__dirname, './server.js'),
    path.resolve(__dirname, './build.ts')
];

export const watchIgnoreDirs: string[] = [
    path.resolve(__dirname, './dependencies'),
    path.resolve(__dirname, '../uploads'),
    path.resolve(__dirname, '../static/build'),
    path.resolve(__dirname, '../archive'),
    path.resolve(__dirname, '../history'),
    path.resolve(__dirname, '../db'),
    path.resolve(__dirname, '../test-env'),
    path.resolve(__dirname, '../.git'),
    path.resolve(__dirname, '../.vscode'),
    path.resolve(__dirname, '../.idea'),
    path.resolve(__dirname, '../.gitignore'),
    path.resolve(__dirname, '../.gitattributes'),
    path.resolve(__dirname, './updates'),
    path.resolve(__dirname, '../logs'),
    path.resolve(__dirname, '../node_modules'),
    path.resolve(__dirname, '../scripts')
];










const dirs = [
    '../static',
    '../static/build',
    './dependencies'
];

for (const dir of dirs) {
    if (!fs.existsSync(path.resolve(__dirname, dir))) {
        fs.mkdirSync(path.resolve(__dirname, dir));
    }
}




// pull json data and remove comments
const readJSON = (path: string): any => {
    let content = fs.readFileSync(path, 'utf8');

    // remove all /* */ comments
    content = content.replace(/\/\*[\s\S]*?\*\//g, '');
    // remove every comment after "// "
    content = content.replace(/\/\/ .*/g, '');

    return JSON.parse(content);
}

type BuildStream = {
    ignore?: string[];
    priority?: string[];
    // ext?: string;
    files: string[];
}


type Build = {
    ignore?: string[];
    minify?: boolean;
    streams: {
        [key: string]: BuildStream
    }
}




const frontTs = fs.readFileSync(path.resolve(__dirname, './front-ts.json'), 'utf8');






enum DownloadStatus {
    DOWNLOADED = 'downloaded',
    NOT_DOWNLOADED = 'not-downloaded',
    DOWNLOADING = 'downloading'
}

// check if file has completed downloading
const isDownloaded = async(url: string): Promise<boolean> => {
    return new Promise(async (res, rej) => {
        parentPort?.postMessage('Requesting: ' + url);
        parentPort?.on('message', (msg) => {
            switch (msg) {
                case DownloadStatus.DOWNLOADED:
                    res(true);
                    break;
                case DownloadStatus.NOT_DOWNLOADED:
                    res(false);
                    break;
            }
        });
    });
}


// this can produce race conditions because it is multithreaded
// pull file from url and save it to dependencies folder
const fromUrl = async (url: string): Promise<{ data: any, safeUrl: string }> => {
    const unsafeChars = ['/', ':', '.', '?', '&', '=', '%', '#', '+', ' '];
    let safeUrl = `${url}`;

    for (const char of unsafeChars) {
        safeUrl = safeUrl
            .split('')
            .map((c) => c === char ? '-' : c)
            .join(''); 
    }

    // add extension back lol
    safeUrl += path.extname(url);

    return new Promise(async (res, rej) => {
        try {

            let data: string;
            if (await isDownloaded(url)) {
                data = await fsPromises.readFile(
                    path.resolve(__dirname, `./dependencies/${safeUrl}`),
                    'utf8'
                );
            } else {
                // to avoid race condition
                parentPort?.postMessage('Downloading: ' + url);
                data = (await axios.get(url)).data;
                await fsPromises.writeFile(
                    path.resolve(__dirname, `./dependencies/${safeUrl}`),
                    data
                );
                parentPort?.postMessage('Downloaded: ' + url);
            }

            res({ data, safeUrl });
        } catch { 
            res({
                safeUrl,
                data: ''
            });
        }
    });
}

// runs tsc on a directory
const fromTsDir = async (dirPath: string, ext: string, stream: boolean = true): Promise<{
    content: string,
    files: string[]
}> => {
    // log('Running tsc: ', dirPath);


    return new Promise(async (res, rej) => {
        try {
            const child = spawn('tsc', [], {
                stdio: 'pipe',
                shell: true,
                cwd: dirPath,
                env: process.env
            });

            // child.on('error', error);
            // child.stdout.on('data', (data) => {
            //     log(data.toString());
            // });

            // child.stderr.on('data', (data) => {
            //     error(data.toString());
            // });

            child.on('close', () => {   
                const tsConfig = readJSON(path.resolve(__dirname, dirPath, './tsconfig.json'));

                if (!stream) return res({
                    content: '',
                    files: 
                        tsConfig?.compilerOptions?.outFile ? 
                            [tsConfig.compilerOptions.outFile] :
                            []
                });

                // return the contents of the built file
                if (tsConfig?.compilerOptions?.outFile) {
                    return res(fromFile(
                        path.resolve(__dirname, path.relative(__dirname, dirPath), tsConfig.compilerOptions.outFile)
                        , ext));
                }
                res({
                    content: '',
                    files: []
                });
            });
        } catch { res({
            content: '',
            files: []
        }); }
    });
}

// generates css from sass
const fromSass = async (filePath: string): Promise<string> => {
    return new Promise(async (res, rej) => {
        try {
            const { css } = sass.compile(path.resolve(__dirname, filePath), {
                outputStyle: 'compressed'
            } as any);
            res(css.toString());

            // for rendering purposes
            fsPromises.writeFile(
                path.resolve(__dirname, filePath.replace('.sass', '.css').replace('.scss', '.css')),
                css.toString()
            );
        } catch { res(''); }
    });
}

// builds from a single file
const fromFile = (filePath: string, ext: string): Promise<{
    content: string,
    files: string[]
}> => {
    return new Promise(async (res, rej) => {
        // let content = '';
        try {
            // log('Adding file to stream', filePath);
            // // log(path.extname(filePath), ext);
            if (path.extname(filePath) !== ext) {
                return res({
                    content: '',
                    files: [filePath]
                });
            }
            // // log(filePath);
            const data = await fsPromises.readFile(
                filePath,
                'utf8'
            );

            // content += data || '';

            res({
                content: data,
                files: [filePath]
            });

        } catch (err) {
            error('Error adding file:', filePath);
            res({
                content: '',
                files: [filePath]
            });
        }
    });
}

// builds from a directory
const fromDir = async (dirPath: string, ext: '.js' | '.css', ignoreList: string[]): Promise<{
    content: string,
    files: string[]
}> => {
    try {
        let content = '';
        const renderedFiles: string[] = [];

        const delimiter = {
            '.js': `;\n`,
            '.css': `\n`
        };

        // recursive function to pull the contents of a directory
        const readDir = async (dirPath: string) => {
            // log(dirPath);
            if (dirPath.includes('.git')) return;
            if (dirPath.includes('[ts]')) {
                const {
                    content: tsContent,
                    files: tsFile
                } =  await fromTsDir(dirPath, ext);
                content += tsContent;
                renderedFiles.push(...tsFile);
                return;
            }

            const files = await fsPromises.readdir(dirPath);
            for (const file of files) {
                // log('Reading file:', file);
                if (fs.lstatSync(path.resolve(dirPath, file)).isDirectory()) {
                    await readDir(path.resolve(dirPath, file));
                    continue;
                }


                if (file.endsWith('.sass') || file.endsWith('.scss')) {
                    content += await fromSass(path.resolve(dirPath, file));
                    renderedFiles.push(path.resolve(dirPath, file).replace('.sass', '.css').replace('.scss', '.css'));
                    content += delimiter[ext] || '\n';
                    continue;
                }

                if (file.endsWith('.css')) {
                    // check if .sass or .scss file exists
                    // if so, then don't add the .css file since it will be added later
                    let hasSass = await fsPromises.access(path.resolve(dirPath, file.replace('.css', '.sass')))
                        .then(() => true)
                        .catch(() => false);

                    let hasScss = await fsPromises.access(path.resolve(dirPath, file.replace('.css', '.scss')))
                        .then(() => true)
                        .catch(() => false);

                    if (hasSass || hasScss) continue;
                }


                if (ext && !file.endsWith(ext)) continue;
                if (ignoreList.includes(file)) continue;

                const { content: fileContent } = await fromFile(path.resolve(dirPath, file), ext);
                content += fileContent;
                renderedFiles.push(path.resolve(dirPath, file));
                content += delimiter[ext] || '\n';
            }
        }

        if ((await fsPromises.lstat(dirPath)).isDirectory()) await readDir(dirPath);

        return {
            content,
            files: renderedFiles
        };
    } catch (e) { 
        error(e);
        return {
            content: '',
            files: []
        }
    }
}




// copies the contents of a file and places it in the build directory
const copyFile = async (filePath: string, streamName: string, index: number): Promise<void> => {
    return new Promise(async (res, rej) => {
        try {
            if (filePath.includes('http')) {
                // log('file is url:', filePath);
                const { data, safeUrl } = await fromUrl(filePath);
                fsPromises.writeFile(
                    path.resolve(__dirname, '..', 'static', 'build', 'dir-' + streamName.replace('.', '-'),
                        index + safeUrl + path.extname(filePath)
                    ),
                    data
                );

                return res();
            }

            // log('file is not url:', filePath);

            const hasTS = filePath.includes('[ts]');

            // filePath = filePath.replace('[ts]', '');

            // copy all files or folders from path
            await fsPromises.cp(
                path.resolve(__dirname, filePath).replace('[ts]', ''),
                path.resolve(__dirname, '..', 'static', 'build', 'dir-' + streamName.replace('.', '-'),
                    index + filePath
                        .replace(new RegExp('/', 'g'), '')
                ),
                { recursive: true }
            );

            if (hasTS) {
                await fsPromises.writeFile(
                    path.resolve(__dirname, '..', 'static', 'build', 'dir-' + streamName.replace('.', '-'), index + filePath.replace(new RegExp('/', 'g'), ''), 'tsconfig.json'),
                    frontTs
                );
            }

            res();
        } catch { 
            res(); 
        }
    });
};

// runs tsc on the server-functions directory
export const buildServerFunctions = async (): Promise<void> => {
    return new Promise((res, rej) => {
        // tsc an entire directory using ts package
        try {
            ts.createProgram([path.resolve(__dirname, '../server.ts')], {}).emit();


            const child = ChildProcess.spawn('tsc', [
                '--build',
                path.resolve(__dirname, '../server-functions/tsconfig.json')
            ], {
                stdio: 'pipe',
                shell: true,
                cwd: path.resolve(__dirname, '../server-functions'),
                env: process.env
            });

            child.on('error', error);
            child.stdout.on('data', log);
            child.stderr.on('data', error);
            child.on('exit', (code) => {
                if (code !== 0) {
                    error('Error building server functions');
                }

                res();
            });
        } catch { res(); }
    });
}

// generates stream directory and makes all files and folders
const buildInit = async(streamName: string, buildStream: BuildStream): Promise<void> => {
    const min = streamName
        .replace(
            path.extname(streamName),
            '.min' + path.extname(streamName)
        );

    // log('Building stream:', streamName);

    const {
        files
    } = buildStream;

    const streamDirPath = path.resolve(__dirname, `../static/build/dir-${streamName.replace('.', '-')}`);

    const makeStreamDir = async () => {
        // log('Making stream dir:', streamDirPath);
        return await fsPromises.mkdir(streamDirPath);
    };


    // async make files and folders
    await Promise.all([
        fsPromises.writeFile(path.resolve(__dirname, `../static/build/${streamName}`), ''),
        fsPromises.writeFile(path.resolve(__dirname, `../static/build/${min}`), ''),
        fsPromises.rm(streamDirPath, { recursive: true, force: true })
            .then(makeStreamDir)
            .catch(makeStreamDir)
    ]);

    await Promise.all(
        Object.entries(files)
            .map(async ([index, file]) => {
                // log('Copying file:', file);
                if (file.includes('--ignore-build')) return;
                if (file.includes('http')) {
                    if (!file.includes('--force')) {
                        parentPort?.postMessage('Files: ' + JSON.stringify([file]));
                        return;
                    }
                    file = file.replace('--force', '');
                }
                file = file.trim();
                return copyFile(file, streamName, +index);
            }));
};

// this is meant for development mode, but it is highly performance intensive and should not be used yet
const startDevWorkers = (streamName: string): Promise<void> => {
    return new Promise((res, rej) => {
        const dir = path.resolve(__dirname, `../static/build/dir-${streamName.replace('.', '-')}`);

        const worker = new Worker(path.resolve(__dirname, './run-ts.js'), {
            workerData: {
                dir,
                options: frontTs
            }
        });


        worker.on('message', (msg) => {
            if (msg === 'done') {
                res();
            }
        }
        );

        worker.on('error', error);
        worker.on('exit', (code) => {
            if (code !== 0) {
                error('Error building server functions');
            }
        });
    });
};





enum BuildType {
    INIT = 'init',
    POST = 'post'
}

// runs the build, but checks if it needs to run init first
const startBuild = async(streamName: string, buildStream: BuildStream, buildType: BuildType, ignore: string[] = [], minify: boolean = true, env: string): Promise<void> => {
    try {
        // log('Running build: ', streamName);
        if (buildType === BuildType.INIT) await buildInit(streamName, buildStream);
        await build(streamName, buildStream, ignore, minify, env);
    } catch (error) {
        error(error);
    }
};


// stops all build workers so that they can be restarted
export const stopWorkers = async () => {
    return Promise.all(workers.map(w => w.terminate()));
};

const workerDownloads = {};
export const renderedBuilds: {
    [key: string]: string[]
} = {};

let workers: Worker[] = [];
// entry point for build process
export const doBuild = async(env: string): Promise<void> => {
    let build: Build;
    try {
        build = readJSON(path.resolve(__dirname, './build.json')) as Build;
    } catch (e) { 
        error('Error reading build.json: ', e);
        return;
    }
    const { streams, ignore, minify } = build;
    return new Promise(async(res, rej) => {
        try {
            if (isMainThread) {
                // main thread is used to start all the workers and handle the messages
                workers = Object.keys(build.streams)
                    .map((streamName): Worker => {
                        const worker = new Worker(
                            path.resolve(__dirname, './build.js'), {
                            workerData: {
                                // pass in which stream to use
                                streamName,
                                stream: streams[streamName],
                                buildType: BuildType.INIT,
                                renderedBuild: {},
                                env
                            }
                        });

                        renderedBuilds[streamName] = [];

                        worker.on('message', (msg) => {
                            switch (msg) {
                                case 'done':
                                    worker.terminate();
                                    break;
                                case 'error':
                                    worker.terminate();
                                    break;
                            };

                            if (msg.includes('Requesting:')) {
                                const url = msg.split(' ')[1];
                                worker.postMessage(
                                    workerDownloads[url] ? 
                                    DownloadStatus.DOWNLOADED : 
                                    DownloadStatus.NOT_DOWNLOADED
                                );
                            } else if (msg.includes('Downloading:')) {
                                // worker is currently in process of downloading, don't do anything
                            } else if (msg.includes('Downloaded:')) {
                                const url = msg.split(' ')[1];
                                workerDownloads[url] = true;
                            } else if (msg.includes('Files:')) {
                                const files: string = msg.split(' ').slice(1).join(' ');
                                renderedBuilds[streamName].push(...JSON.parse(files) as string[]);
                            }
                        });

                        worker.on('error', error);

                        return worker;
                    });

                    // resolves when all workers are done
                await Promise.all(workers.map(w => {
                    return new Promise((res, rej) => {
                        w.on('exit', () => {
                            res(true);
                        });
                    });
                }));

                res();
            } else {
                // worker thread is used to run a single build stream
                const { streamName, stream, buildType, env } = workerData;
                // log('New worker', workerData);
                try {
                    await startBuild(streamName, stream, buildType, ignore, minify, env);
                } catch {
                    // log('Error running build');
                    parentPort?.postMessage('error');
                }
                parentPort?.postMessage('done');
            }
        } catch { rej(); };
    });
};



// post initialization, this will handle all build processes, combining, and minification of files
const build = async(streamName: string, buildStream: BuildStream, ignore: string[], minify: boolean, env: string): Promise<void> => {
    const streamDirPath = path.resolve(__dirname, `../static/build/dir-${streamName.replace('.', '-')}`);
    const streamPath = path.resolve(__dirname, '../static/build', streamName);
    let { content, files } = await fromDir(
        streamDirPath,
        path.extname(streamName) as '.js' | '.css',
        [...(ignore || []), ...(buildStream.ignore || [])]
    );

    // files = files.map(f => {
    //     return path.relative(__dirname, f);
    // });

    // if (!isMainThread) {
    //     parentPort?.postMessage('Files: ' + JSON.stringify(files));
    // }

    if (!content) content = '';

    await fsPromises.writeFile(streamPath, content);

    if (env === 'dev') {
        // await startDevWorkers(streamName);
    }

    if (minify) {
        // log('Minifying stream:', streamName);
        const ext = path.extname(streamPath);
        const minStreamName = streamName.replace(ext, '.min' + ext);

        switch (ext) {
            case '.js':
                content = UglifyJS.minify(content, {
                    compress: {
                        // drop_console: true
                    }
                }).code;
                break;
            case '.css':
                content = await postcss([autoprefixer, cssnano]).process(content, { from: undefined })
                    .then(result => {
                        return result.css;
                    }).catch(err => {
                        // log("ERROR MINIFYING CSS", err);
                    }) || '';
                break;
        }

        if (!content) content = '';

        await Promise.all([
            fsPromises.writeFile(
                path.resolve(__dirname, '../static/build', minStreamName),
                content
            )
        ]);
    }
};


// used for a watch program, this will only build the file that was changed
// TODO: this will sometime inject a file into a build stream twice. In that case, just run the command 'build' while the main process has started
export const onFileChange = async (filename: string, env: string) => {
    if (filename.includes('server-functions') || filename === path.resolve(__dirname, '../server.ts')) {
        log('Server functions changed, file');

        const program = ts.createProgram([filename], {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.CommonJS,
            allowJs: true,
            checkJs: false,
            forceConsistentCasingInFileNames: true,
            esModuleInterop: true,
            skipLibCheck: true
        });

        // const emitResult = program.emit();

        // const allDiagnostics = ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics);

        // allDiagnostics.forEach(diagnostic => {
        //     if (diagnostic.file) {
        //         const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start!);
        //         const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
        //         log(`${diagnostic.file.fileName} (${line + 1},${character + 1}): ${message}`);
        //     } else {
        //         log(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
        //     }
        // });
    
        // const exitCode = emitResult.emitSkipped ? 1 : 0;
    
        // if (exitCode !== 0) {
        //     error(new Error('There was an error compiling the project'));
        // }

        log('Built single file');
    
        return;
    }

    const _build = readJSON(path.resolve(__dirname, './build.json')) as Build;
    const { streams, minify } = _build;

    
    // gets the filename relative to the stream
    const filePath = path.relative(__dirname, filename)
        .replace('.ts', '.js')
        .replace('.sass', '.css')
        .replace('.scss', '.css');

    let dirPath = path.dirname(filePath);
    const basename = path.basename(filePath);
    // const replaceFilename = dirPath.replace(new RegExp('/', 'g'), '') + '/' + basename;

    const getStreamDir = (files: string[]): string | undefined => {
        // checks if the file's directory is in the stream
        // if the filename (full filepath) includes the full directory path, then it is in the stream
        const inStream = files.find((file) => {
                const fileDir = path.resolve(__dirname, file.replace('[ts]', '').replace('--ignore-build', ''));
                return filename.includes(fileDir);
            });

        // returns the directory path of the file in the stream
        return inStream;
    }

    await Promise.all(
        Object.entries(streams)
        .map(async ([streamName, buildStream]) => {
            return new Promise(async (res, rej) => {
                const streamFolder = getStreamDir(buildStream.files);

                if (streamFolder) {
                    // console.log({streamFolder});

                    // generate relative path to build directory
                    const replacer = streamFolder
                            .replace('[ts]', '')
                            .replace('--ignore-build', '')
                            .replace(new RegExp('/', 'g'), '\\');

                    dirPath = dirPath.replace(
                        replacer,
                        ''
                    ).trim();
                    log('File in stream', filename, streamName);

                    const files = await fsPromises.readdir(
                        path.resolve(__dirname, '../static/build/dir-' + streamName.replace('.', '-'))
                    );
    
                    const folder = files.find((file) => {
                        return file.includes(streamFolder
                            .replace(new RegExp('/', 'g'), '')
                            .replace(/\\/g, '')
                            );
                    });

                    // console.log({ folder, dirPath, replacer });
    
                    // if the folder does not exist, the file may have been created after the build process
                    // in that case, just run the command 'build' while the main process has started
                    if (!folder) {
                        log('Folder not found, file may have been created after build process. Run "build"');
                        return res(null);
                    }
    
                    let fileContent: string = ''; // content to inject into stream file
                    let replaceContent: string = ''; // content to find in stream file
                    let streamContent: string = await fsPromises.readFile(
                        path.resolve(__dirname, '../static/build', streamName),
                        'utf8'
                    );

                    // handle different file types
                    switch (path.extname(filename)) {
                        case '.js':
                        case '.css':
                            // find each file
                            replaceContent = await fsPromises.readFile(
                                path.resolve(__dirname, '../static/build/dir-' + streamName.replace('.', '-'), folder, basename),
                                'utf8'
                            );
                            fileContent = await fsPromises.readFile(
                                filename,
                                'utf8'
                            );
                            break;
                        case '.sass':
                        case '.scss':
                            replaceContent = await fsPromises.readFile(
                                path.resolve(__dirname, '../static/build/dir-' + streamName.replace('.', '-'), folder, basename.replace(path.extname(basename), '.css')),
                                'utf8'
                            );
                            fileContent = await fromSass(filename);
                            break;
                        case '.ts':
                            // ts will compile a folder into a single file
                            // compile the content of the folder, then inject it into the stream file
                            replaceContent = await fsPromises.readFile(
                                path.resolve(__dirname, '../static/build/dir-' + streamName.replace('.', '-'), folder, 'index.js'),
                                'utf8'
                            );

                            await (async () => {
                                return new Promise(async (resolve) => {
                                    await fsPromises.copyFile(
                                        filename,
                                        path.resolve(
                                            __dirname,
                                            '../static/build/dir-' + streamName.replace('.', '-')
                                            + '/' + folder
                                            // + '/' + dirPath
                                            + '/' + basename.replace(path.extname(basename), '.ts')
                                        )
                                    );                                
                                    const child = spawn('tsc', [], {
                                        stdio: 'pipe',
                                        shell: true,
                                        cwd: path.resolve(__dirname, '../static/build/dir-' + streamName.replace('.', '-'), folder),
                                        env: process.env
                                    });

                                    child.on('close', resolve);
                                });
                            })();
                            fileContent = await fsPromises.readFile(
                                path.resolve(__dirname, '../static/build/dir-' + streamName.replace('.', '-'), folder, 'index.js'),
                                'utf8'
                            );
                            break;
                    }

                    // inject the content into the stream file
                    streamContent = streamContent.replace(replaceContent, fileContent);

                    // write the stream file
                    await fsPromises.writeFile(
                        path.resolve(__dirname, '../static/build', streamName),
                        streamContent
                    );

                    // handle minimization
                    if (minify) {
                        const ext = path.extname(streamName);
                        let content = streamContent;
                        switch (ext) {
                            case '.js':
                                content = UglifyJS.minify(content, {
                                    compress: {
                                        // drop_console: true
                                    }
                                }).code;
                                break;
                            case '.css':
                                content = await postcss([autoprefixer, cssnano]).process(content, { from: undefined })
                                    .then(result => {
                                        return result.css;
                                    }).catch(err => {
                                        // log("ERROR MINIFYING CSS", err);
                                    }) || '';
                                break;
                        }

                        if (!content) content = '';
                
                        await Promise.all([
                            fsPromises.writeFile(
                                path.resolve(__dirname, '../static/build', streamName.replace(ext, '.min' + ext)),
                                content
                            )
                        ]);
                    }


                    res(null);
                }

                res(null);
            });
    }));
};

// this will run the build process if it is not the main thread
// doBuild() on the main thread is called by ../main.ts
if (!isMainThread) doBuild(workerData?.env);