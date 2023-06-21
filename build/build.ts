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
import ts from 'typescript';
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
    path.resolve(__dirname, '../node_modules')
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

// const fromTsFile = async (filePath: string, stream: fs.WriteStream, ext: string, streamName: string): Promise<any> => {
//     return new Promise(async (res, rej) => {
//         try {
//             const tsConfig = readJSON(path.resolve(__dirname, filePath, './tsconfig.json'));

//             const program = ts.createProgram([filePath], {
//                 ...tsConfig.compilerOptions,
//                 noEmitOnError: true
//             });
//             const emitResult = program.emit();
        
//             const allDiagnostics = ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics);
        
//             allDiagnostics.forEach(diagnostic => {
//                 if (diagnostic.file) {
//                     const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start!);
//                     const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
//                     // console.log(`${diagnostic.file.fileName} (${line + 1},${character + 1}): ${message}`);
//                 } else {
//                     // console.log(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
//                 }
//             });
        
//             const exitCode = emitResult.emitSkipped ? 1 : 0;
        
//             if (exitCode !== 0) {
//                 console.error(new Error('There was an error compiling the project'));
//             }


//             if (tsConfig?.compilerOptions?.outFile) {
//                 return res(fromFile(tsConfig.compilerOptions.outFile, stream, ext, streamName));
//             }

//             if (tsConfig?.compilerOptions?.outDir) {
//                 return res(fromDirSync(tsConfig.compilerOptions.outDir, '.js', stream, [], streamName));
//             }

//             const readDir = (dirPath: string) => {
//                 const files = fs.readdirSync(dirPath);
//                 for (const file of files) {
//                     if (fs.lstatSync(path.resolve(dirPath, file)).isDirectory()) {
//                         readDir(path.resolve(dirPath, file));
//                         continue;
//                     }

//                     if (file.endsWith('.ts')) watchIgnoreList.push(path.resolve(dirPath, file.replace('.ts', '.js')));
//                 }
//             };

//             if (fs.lstatSync(filePath).isDirectory()) {
//                 readDir(filePath);
//             }
//         } catch { res(null); }
//     });
// }

const fromTsDir = async (dirPath: string, ext: string): Promise<{
    content: string,
    files: string[]
}> => {
    return new Promise(async (res, rej) => {
        try {
            // console.log('Runnint tsc: ', dirPath);
            const child = spawn('tsc', [], {
                stdio: 'pipe',
                shell: true,
                cwd: dirPath,
                env: process.env
            });

            child.on('error', console.error);
            child.stdout.on('data', (data) => {
                // console.log(data.toString());
            });

            child.stderr.on('data', (data) => {
                console.error(data.toString());
            });

            child.on('close', () => {   
                const tsConfig = readJSON(path.resolve(__dirname, dirPath, './tsconfig.json'));

                if (tsConfig?.compilerOptions?.outFile) {
                    return res(fromFile(tsConfig.compilerOptions.outFile, ext));
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

const fromFile = (filePath: string, ext: string): Promise<{
    content: string,
    files: string[]
}> => {
    return new Promise(async (res, rej) => {
        // let content = '';
        try {
            // console.log('Adding file to stream', filePath);
            // // console.log(path.extname(filePath), ext);
            if (path.extname(filePath) !== ext) {
                return res({
                    content: '',
                    files: [filePath]
                });
            }
            // // console.log(filePath);
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
            console.error('Error adding file:', filePath);
            res({
                content: '',
                files: [filePath]
            });
        }
    });
}


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

        const readDir = async (dirPath: string) => {
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
                // console.log('Reading file:', file);
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
                    // if so, continue
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
        console.error(e);
        return {
            content: '',
            files: []
        }
    }
}





const copyFile = async (filePath: string, streamName: string, index: number): Promise<void> => {
    // use fsPromises

    return new Promise(async (res, rej) => {
        try {
            if (filePath.includes('http')) {
                // console.log('file is url:', filePath);
                const { data, safeUrl } = await fromUrl(filePath);
                fsPromises.writeFile(
                    path.resolve(__dirname, '..', 'static', 'build', 'dir-' + streamName.replace('.', '-'),
                        index + safeUrl + path.extname(filePath)
                    ),
                    data
                );

                return res();
            }

            // console.log('file is not url:', filePath);

            filePath = filePath.replace('[ts]', '');

            // copy all files or folders from path
            await fsPromises.cp(
                path.resolve(__dirname, filePath),
                path.resolve(__dirname, '..', 'static', 'build', 'dir-' + streamName.replace('.', '-'),
                    index + filePath
                        .replace(new RegExp('/', 'g'), '')
                ),
                { recursive: true }
            );

            res();
        } catch { 
            res(); 
        }
    });
};


export const buildServerFunctions = async (): Promise<void> => {
    return new Promise((res, rej) => {
        // tsc an entire directory using ts package
        try {
            const child = ChildProcess.spawn('tsc', [
                '--build',
                path.resolve(__dirname, '../server-functions/tsconfig.json')
            ], {
                stdio: 'pipe',
                shell: true,
                cwd: path.resolve(__dirname, '../server-functions'),
                env: process.env
            });

            // child.on('error', console.error);
            // child.stdout.on('data', console.log);
            // child.stderr.on('data', console.error);
            child.on('close', () => {
                res();
            });
        } catch { res(); }
    });
}

const buildInit = async(streamName: string, buildStream: BuildStream): Promise<void> => {
    const min = streamName
    .replace(
        path.extname(streamName),
        '.min' + path.extname(streamName)
    );

    // console.log('Building stream:', streamName);

    const {
        files
    } = buildStream;

    const streamDirPath = path.resolve(__dirname, `../static/build/dir-${streamName.replace('.', '-')}`);

    const makeStreamDir = async () => {
        // console.log('Making stream dir:', streamDirPath);
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
                // console.log('Copying file:', file);
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


const postBuild = async(streamName: string, buildStream: BuildStream, ignore: string[], minify: boolean): Promise<void> => {
    const streamDirPath = path.resolve(__dirname, `../static/build/dir-${streamName.replace('.', '-')}`);
    const streamPath = path.resolve(__dirname, '../static/build', streamName);
    let { content, files } = await fromDir(
        streamDirPath,
        path.extname(streamName) as '.js' | '.css',
        [...(ignore || []), ...(buildStream.ignore || [])]
    );

    files = files.map(f => {
        return path.relative(__dirname, f);
    });

    if (!isMainThread) {
        parentPort?.postMessage('Files: ' + JSON.stringify(files));
    }

    if (!content) content = '';

    await fsPromises.writeFile(streamPath, content);

    if (minify) {
        // console.log('Minifying stream:', streamName);
        const ext = path.extname(streamPath);
        const minStreamName = streamName.replace(ext, '.min' + ext);

        switch (ext) {
            case '.js':
                content = UglifyJS.minify(content, {
                    compress: {
                        drop_console: true
                    }
                }).code;
                break;
            case '.css':
                content = await postcss([autoprefixer, cssnano]).process(content, { from: undefined })
                    .then(result => {
                        return result.css;
                    }).catch(err => {
                        // console.log("ERROR MINIFYING CSS", err);
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

enum BuildType {
    INIT = 'init',
    POST = 'post'
}

const _runBuild = async(streamName: string, buildStream: BuildStream, buildType: BuildType, ignore: string[] = [], minify: boolean = true): Promise<void> => {
    try {
        // console.log('Running build: ', streamName);
        if (buildType === BuildType.INIT) await buildInit(streamName, buildStream);
        await postBuild(streamName, buildStream, ignore, minify);
    } catch (error) {
        console.error(error);
    }
};



export const stopWorkers = () => {
    for (const w of workers) {
        w.terminate();
    };
};

const workerDownloads = {};
export const renderedBuilds: {
    [key: string]: string[]
} = {};

let workers: Worker[] = [];
export const doBuild = async(): Promise<void> => {
    let build: Build;
    try {
        build = readJSON(path.resolve(__dirname, './build.json')) as Build;
    } catch (e) { 
        console.error('Error reading build.json: ', e);
        return;
    }
    const { streams, ignore, minify } = build;
    return new Promise(async(res, rej) => {
        try {
            if (isMainThread) {
                workers = Object.keys(build.streams)
                    .map((streamName): Worker => {
                        const worker = new Worker(
                            path.resolve(__dirname, './build.js'), {
                            workerData: {
                                streamName,
                                stream: build.streams[streamName],
                                buildType: BuildType.INIT,
                                renderedBuild: {}
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
                                const files: string = msg.split(' ')[1] as string;
                                renderedBuilds[streamName].push(...JSON.parse(files) as string[]);
                            }
                        });

                        worker.on('error', console.error);

                        return worker;
                    });

                await Promise.all(workers.map(w => {
                    return new Promise((res, rej) => {
                        w.on('exit', () => {
                            res(true);
                        });
                    });
                }));

                res();
            } else {
                const { streamName, stream, buildType } = workerData;
                // console.log('New worker', workerData);
                try {
                    await _runBuild(streamName, stream, buildType, ignore, minify);
                } catch {
                    // console.log('Error running build');
                    parentPort?.postMessage('error');
                }
                parentPort?.postMessage('done');
            }
        } catch { rej(); };
    });
};


export const onFileChange = async (filename: string) => {
    const build = readJSON(path.resolve(__dirname, './build.json')) as Build;
    const { streams, ignore, minify } = build;

    const isFileInStream = async (files: string[]): Promise<boolean> => {
        return new Promise((res, rej) => {
            // check if file is in files
            // check if file is any directory in files
            

            // dir or file
            const filePath = path.resolve(__dirname, '..', filename);

            // exact file match
            if (files.includes(filePath)) return res(true);

            res(
                files.some(async (file) => {
                    const matchFilePath = path.resolve(__dirname, file);

                    // this should work with either a file or a directory
                    return filePath.includes(matchFilePath);
                })
            );
        });
    }

    await Promise.all(
        Object.entries(streams)
        .map(async ([streamName, buildStream]) => {
            if (await isFileInStream(buildStream.files)) {
                // copy file over
                await fsPromises.copyFile(
                    path.resolve(__dirname, '..', filename),
                    path.resolve(__dirname, '../static/build/dir-' + streamName.replace('.', '-'), filename)
                );
                
                const w = new Worker(__filename, {
                    workerData: {
                        streamName,
                        stream: buildStream,

                        // will not init build directory
                        buildType: BuildType.POST
                    }
                });

                w.on('message', (msg) => {
                    switch (msg) {
                        case 'done':
                            w.terminate();
                            break;
                        case 'error':
                            w.terminate();
                            break;
                    };
                });
            }
        }));
};

if (!isMainThread) doBuild();