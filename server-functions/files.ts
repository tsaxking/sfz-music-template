import { NextFunction } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuid } from 'uuid';
import { HTMLElement, parse } from 'node-html-parser';
import render from 'node-html-constructor/versions/v4';
import callsite from 'callsite';
import { workerData } from 'worker_threads';
import ObjectsToCsv from 'objects-to-csv';
import { config } from 'dotenv';


config();


// console.log(build);

/**
 * Description placeholder
 *
 * @type {*}
 */
const env = workerData?.mode || process.argv[2] || 'dev';


/**
 * Gets a json from the jsons folder
 *
 * @export
 * @param {string} file the file name with no extension (ex '/accounts')
 * @returns {*} false if there is an error, otherwise the json
 * 
 * @example
 * ```javascript
 * const accounts = getJSON('/accounts');
 * ```
 * 
 * 
 */
export function getJSONSync(file: string): any {
    let p: string = file;
    if (!file.includes('.json')) file +='.json';
    if (!(file.startsWith('.'))) p = path.resolve('./jsons', file);
    else {
        const stack = callsite(),
            requester = stack[1].getFileName(),
            requesterDir = path.dirname(requester);
        p = path.resolve(requesterDir, p);
    }
    
    p = path.resolve(__dirname, p);

    if (!fs.existsSync(p)) {
        console.error('Error reading JSON file: ' + p, 'file does not exist. Input: ', file);
        return false;
    }

    let content = fs.readFileSync(p, 'utf8');

    // remove all /* */ comments
    content = content.replace(/\/\*[\s\S]*?\*\//g, '');

    // remove all // comments
    content = content.replace(/\/\/ .*/g, '');
    
    try {
        return JSON.parse(content);
    } catch (e) {
        console.error('Error parsing JSON file: ' + file, e);
        return false;
    }
};

/**
 * Gets a json from the jsons folder
 *
 * @export
 * @param {string} file the file name with no extension (ex '/accounts')
 * @returns {Promise<any>} false if there is an error, otherwise the json
 * 
 * @example
 * ```javascript
 * const accounts = await getJSON('/accounts');
 * ```
 */
export function getJSON(file: string): Promise<any> {
    return new Promise((res, rej) => {
        let p: string = file;
        if (!file.includes('.json')) file +='.json';
        if (!(file.startsWith('.'))) p = path.resolve('./jsons', file);
        else {
            const stack = callsite(),
                requester = stack[1].getFileName(),
                requesterDir = path.dirname(requester);
            p = path.resolve(requesterDir, p);
        }
        
        p = path.resolve(__dirname, p);
    
        if (!fs.existsSync(p)) {
            console.error('Error reading JSON file: ' + p, 'file does not exist. Input: ', file);
            return false;
        }

        fs.readFile(p, 'utf8', (err, content) => {
            if (err) {
                console.error('Error reading JSON file: ' + file, err);
                return rej(err);
            }

            // remove all /* */ comments
            content = content.replace(/\/\*[\s\S]*?\*\//g, '');

            // remove all // comments
            content = content.replace(/\/\/ .*/g, '');
            
            try {
                res(JSON.parse(content));
            } catch (e) {
                console.error('Error parsing JSON file: ' + file, e);
                res(false);
            }
        });
    });
}

/**
 * Saves a json to the jsons folder
 *
 * @export
 * @param {string} file the file name with no extension (ex '/accounts')
 * @param {*} data the data to save
 * @returns {boolean} whether the file was saved successfully
 * If the file is not saved successfully, it will log the error and return false
 * 
 * 
 */
export function saveJSONSync(file: string, data: any) {
    let p: string = file;
    if (!file.includes('.json')) file +='.json';
    if (!(file.startsWith('.'))) p = path.resolve('./jsons', file);
    else {
        const stack = callsite(),
            requester = stack[1].getFileName(),
            requesterDir = path.dirname(requester);
        p = path.resolve(requesterDir, p);
    }
    
    p = path.resolve(__dirname, p);

    try {
        JSON.stringify(data);
    } catch (e) {
        console.error('Error stringifying JSON file: ' + file, e);
        return false;
    }

    fs.writeFileSync(p, JSON.stringify(data, null, 4), 'utf8');
    return true;
}

/**
 * Saves a json to the jsons folder
 *
 * @export
 * @param {string} file the file name with no extension (ex '/accounts')
 * @param {*} data the data to save
 * @returns {Promise<boolean>} whether the file was saved successfully
 * If the file is not saved successfully, it will log the error and return false
 * 
 * 
 */
export function saveJSON(file: string, data: any): Promise<boolean> {
    return new Promise((res, rej) => {
        let p: string = file;
        if (!file.includes('.json')) file +='.json';
        if (!(file.startsWith('.'))) p = path.resolve('./jsons', file);
        else {
            const stack = callsite(),
                requester = stack[1].getFileName(),
                requesterDir = path.dirname(requester);
            p = path.resolve(requesterDir, p);
        }
        
        p = path.resolve(__dirname, p);
        try {
            JSON.stringify(data);
        } catch (e) {
            console.error('Error stringifying JSON file: ' + file, e);
            return res(false);
        }

        fs.writeFile(p, JSON.stringify(data, null, 4), 'utf8', err => {
            if (err) return rej(err);
            res(true);
        });
    });
}





/**
 * Builds for development only (Caches)
 *
 * @type {*}
 */
let builds: any = workerData?.builds || {};
/**
 * Description placeholder
 *
 * @type {*}
 */
const buildJSON = getJSONSync('../build/build.json');
!buildJSON.buildDir.endsWith('/') && (buildJSON.buildDir += '/'); // make sure it ends with a slash 

/**
 * Parses the html and adds the builds
 *
 * @param {string} template
 * @returns {*}
 */
const runBuilds = (template: string): string => {
    // console.log('Running build on template: ', template);
    const root = parse(template);
    const insertBefore = (parent: HTMLElement, child: HTMLElement, before: HTMLElement) => {
        parent.childNodes.splice(parent.childNodes.indexOf(before), 0, child);
    }

    switch (env) {
        case 'prod': // production (combine and minify)
            root.querySelectorAll('.developer').forEach(d => d.remove());

            root.querySelectorAll('script').forEach(s => {
                if (!s.attributes.src) return;
                const stream = buildJSON.streams[s.attributes.src];
                if (!stream) return;

                const ext = path.extname(s.attributes.src);
                const name = path.basename(s.attributes.src, ext);

                s.setAttribute('src', `${buildJSON.buildDir}${buildJSON.minify ? name + '.min' + ext : name + ext}`);

                (stream.files as string[]).forEach(f => {
                    // console.log(f);

                    if (!f.endsWith('--ignore-build')) {
                        if (!f.startsWith('http') && !f.endsWith('--force')) {
                            return;
                        }
                    }


                    // console.log('Includes ignore build', f);
                    f = f.replace('--ignore-build', '').trim();
                    const script = parse(`<script src="${f.replace('[ts]','')}"></script>`);
                    // console.log(script.innerHTML);
                    insertBefore(s.parentNode, script, s);
                });
            });

            root.querySelectorAll('link').forEach(l => {
                if (!l.attributes.href) return;
                const stream = buildJSON.streams[l.attributes.href];
                if (!stream) return;

                const ext = path.extname(l.attributes.href);
                const name = path.basename(l.attributes.href, ext);

                l.setAttribute('href', `${buildJSON.buildDir}${buildJSON.minify ? name + '.min' + ext : name + ext}`);


                (stream.files as string[]).forEach(f => {
                    // console.log(f);

                    if (!f.endsWith('--ignore-build')) {
                        if (!f.startsWith('http') && !f.endsWith('--force')) {
                            return;
                        }
                    }

                    // console.log('Includes ignore build', f);
                    f = f.replace('--ignore-build', '').trim();
                    const link = parse(`<link rel="stylesheet" href="${f}">`);
                    // console.log(link.innerHTML);
                    insertBefore(l.parentNode, link, l);
                });
            });
            break;
        case 'test': // testing (combine but do not minify)
            root.querySelectorAll('.developer').forEach(d => d.remove());

            root.querySelectorAll('script').forEach(s => {
                if (!s.attributes.src) return;
                const stream = buildJSON.streams[s.attributes.src];
                if (!stream) return;

                s.setAttribute('src', `${buildJSON.buildDir}${s.attributes.src}`);
                (stream.files as string[]).forEach(f => {
                    // console.log(f);

                    if (!f.endsWith('--ignore-build')) {
                        if (!f.startsWith('http') && !f.endsWith('--force')) {
                            return;
                        }
                    }

                    // console.log('Includes ignore build', f);
                    f = f.replace('--ignore-build', '').trim();
                    const script = parse(`<script src="${f.replace('[ts]','')}"></script>`);
                    // console.log(script.innerHTML);
                    insertBefore(s.parentNode, script, s);
                });
            });

            root.querySelectorAll('link').forEach(l => {
                if (!l.attributes.href) return;
                const stream = buildJSON.streams[l.attributes.href];
                if (!stream) return;

                l.setAttribute('href', `${buildJSON.buildDir}${l.attributes.href}`);
                (stream.files as string[]).forEach(f => {
                    // console.log(f);

                    if (!f.endsWith('--ignore-build')) {
                        if (!f.startsWith('http') && !f.endsWith('--force')) {
                            return;
                        }
                    }

                    // console.log('Includes ignore build', f);
                    f = f.replace('--ignore-build', '').trim();
                    const link = parse(`<link rel="stylesheet" href="${f}">`);
                    // console.log(link.innerHTML);
                    insertBefore(l.parentNode, link, l);
                });
            });
            break;
        case 'dev': // development (do not combine files)
            Object.keys(builds).forEach(script => {
                if (script.endsWith('.js')) {
                    const scriptTag = root.querySelector(`script[src="${script}"]`);
                    if (!scriptTag) return;

                    (workerData?.builds[script] as string[]).forEach(build => {
                        const newScript = parse(`<script src="${build.replace(/\\/g, '/')}"></script>`);
                        insertBefore(scriptTag.parentNode, newScript, scriptTag);
                    });
                    scriptTag.remove();
                } else if (script.endsWith('.css')) {
                    const linkTag = root.querySelector(`link[href="${script}"]`);
                    if (!linkTag) return;

                    (workerData?.builds[script] as string[]).forEach(build => {
                        const newLink = parse(`<link rel="stylesheet" href="${build.replace(/\\/g, '/')}">`);
                        insertBefore(linkTag.parentNode, newLink, linkTag);
                    });
                    linkTag.remove();
                }
            });
    }

    return root.toString();
}


/**
 * Description placeholder
 *
 * @type {*}
 */
const templates = new Map<string, string>();

/**
 * Description placeholder
 *
 * @typedef {ConstructorOptions}
 */
type ConstructorOptions = {
    [key: string]: any;
}

/**
 * Gets an html template from the templates folder
 * 
 * @export
 * @param {string} file the file name with no extension (ex '/index')
 * @returns {string|boolean} false if there is an error, otherwise the html
 */
export function getTemplateSync(file: string, options?: ConstructorOptions): string|boolean {
    if (templates.has(file)) {
        return templates.get(file) as string;
    }
    let p: string = file;
    if (!file.includes('.html')) file +='.html';
    if (!(file.startsWith('.'))) p = path.resolve('./templates', file);
    else {
        const stack = callsite(),
            requester = stack[1].getFileName(),
            requesterDir = path.dirname(requester);
        p = path.resolve(requesterDir, p);
    }
    
    p = path.resolve(__dirname, p);

    if (!fs.existsSync(p)) {
        console.error(`Template ${p} does not exist. Input:`, file);
        return false;
    }

    let data = fs.readFileSync(p, 'utf8');
    data = runBuilds(data);
    templates.set(file, data);
    return options ? render(data, options) : data;
};

/**
 * Gets an html template from the templates folder
 *
 * @export
 * @param {string} file the file name with no extension (ex '/index')
 * @returns {Promise<string|boolean>} false if there is an error, otherwise the html
 */
export function getTemplate(file: string, options?: ConstructorOptions): Promise<string|boolean> {
    return new Promise((res, rej) => {
        if (templates.has(file)) {
            return res(templates.get(file) as string);
        }
        let p: string = file;
        if (!file.includes('.html')) file +='.html';
        if (!(file.startsWith('.'))) p = path.resolve('./templates', file);
        else {
            const stack = callsite(),
                requester = stack[1].getFileName(),
                requesterDir = path.dirname(requester);
            p = path.resolve(requesterDir, p);
        }
        
        p = path.resolve(__dirname, p);
    
        if (!fs.existsSync(p)) {
            console.error(`Template ${p} does not exist. Input:`, file);
            return false;
        }

        fs.readFile(p, 'utf8', (err, data) => {
            if (err) return rej(err);
            data = runBuilds(data);
            templates.set(file, data);
            res(options ? render(data, options) : data);
        });
    });
}

/**
 * Saves an html template to the templates folder
 *
 * @export
 * @param {string} file the file name with no extension (ex '/index')
 * @param {string} data the data to save
 * @returns {boolean} whether the file was saved successfully
 */
export function saveTemplateSync(file: string, data: string) {
    let p: string = file;
    if (!file.includes('.html')) file +='.html';
    if (!(file.startsWith('.'))) p = path.resolve('./templates', file);
    else {
        const stack = callsite(),
            requester = stack[1].getFileName(),
            requesterDir = path.dirname(requester);
        p = path.resolve(requesterDir, p);
    }
    
    p = path.resolve(__dirname, p);


    fs.writeFileSync(p, data, 'utf8');
    return true;
}

/**
 * Saves an html template to the templates folder
 *
 * @export
 * @param {string} file the file name with no extension (ex '/index')
 * @param {string} data the data to save
 * @returns {Promise<boolean>} whether the file was saved successfully
 */
export function saveTemplate(file: string, data: string): Promise<boolean> {
    return new Promise((res, rej) => {
        let p: string = file;
        if (!file.includes('.html')) file +='.html';
        if (!(file.startsWith('.'))) p = path.resolve('./templates', file);
        else {
            const stack = callsite(),
                requester = stack[1].getFileName(),
                requesterDir = path.dirname(requester);
            p = path.resolve(requesterDir, p);
        }
        
        p = path.resolve(__dirname, p);


        fs.writeFile(p, data, 'utf8', err => {
            if (err) return rej(err);
            res(true);
        });
    });
}

/**
 * Saves a file to the uploads folder
 *
 * @export
 * @param {*} data the data to save
 * @param {string} filename the filename to save it as
 * @returns {Promise<void>}
 */
export function saveUpload(data: any, filename: string): Promise<void> {
    return new Promise((res, rej) => {
        data = Buffer.from(data, 'binary');

        fs.writeFile(path.resolve(__dirname, '../uploads', filename), data, err => {
            if (err) rej(err);
            else res();
        });
    });
}

/**
 * Description placeholder
 *
 * @typedef {File}
 */
type File = {
    filename: string;
    ext: string;
    data: any;
}

/**
 * Description placeholder
 *
 * @export
 * @param {File[]} files
 * @returns {Promise<void>}
 */
export function uploadMultipleFiles(files: File[]): Promise<void> {
    return new Promise((resolve, reject) => {
        const promises: Promise<any>[] = [];
        files.forEach(file => {
            promises.push(saveUpload(file.data, file.filename + file.ext));
        });

        Promise.all(promises).then(() => resolve()).catch(err => reject(err));
    });
}

/**
 * Description placeholder
 *
 * @export
 * @param {string} filename
 * @returns {*}
 */
export function getUpload(filename: string): Promise<any> {
    return new Promise((resolve, reject) => {
        fs.readFile(path.resolve(__dirname, '../uploads', filename), (err, data) => {
            if (err) reject(err);
            else resolve(data);
        });
    });
}

/**
 * Description placeholder
 *
 * @export
 * @param {string} filename
 * @returns {Promise<void>}
 */
export function deleteUpload(filename: string): Promise<void> {
    return new Promise((resolve, reject) => {
        fs.unlink(path.resolve(__dirname, '../uploads', filename), err => {
            if (err) reject(err);
            else resolve();
        });
    });
}

/**
 * Description placeholder
 *
 * @export
 * @param {number} bytes
 * @param {number} [decimals=2]
 * @returns {{ string: string, type: string }}
 */
export function formatBytes(bytes: number, decimals: number = 2): { string: string, type: string } {
    if (bytes === 0) return {
        string: '0 Bytes',
        type: 'Bytes'
    };

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return {
        string: parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i],
        type: sizes[i]
    }
}






/**
 * Description placeholder
 *
 * @typedef {FileStreamOptions}
 */
type FileStreamOptions = {
    maxFileSize?: number;
    extensions?: string[];
}


export type CustomFile = {
    id: string;
    name: string;   
    size: string;
    type: string;
    ext: string;
    contentType: string;
}

/**
 * Description placeholder
 *
 * @typedef {CustomHeaderRequest}
 */
type CustomHeaderRequest = Request & {
    headers: {
        'x-content-type': string;
        'x-file-name': string;
        'x-file-size': string;
        'x-file-type': string;
        'x-file-ext': string;
    }

    on: (event: string, callback: (chunk: any) => void) => void;
    file: CustomFile;
}

/**
 * Description placeholder
 *
 * @typedef {CustomResponse}
 */
type CustomResponse = Response & {
    json: (data: any) => void;
}

/**
 * Description placeholder
 *
 * @param {FileStreamOptions} opts
 * @returns {(req: any, res: any, next: any) => unknown}
 */
export const fileStream = (opts: FileStreamOptions): NextFunction => {
    const fn =  async(req: CustomHeaderRequest, res: CustomResponse, next: NextFunction) => {
        let { maxFileSize, extensions } = opts;
        maxFileSize = maxFileSize || 1000000;

        const generateFileId = () => {
            return uuid() + '-' + Date.now();
        }
        let {
            headers: {
                'x-content-type': contentType,
                'x-file-name': fileName,
                'x-file-size': fileSize,
                'x-file-type': fileType,
                'x-file-ext': fileExt
            }
        } = req;

        if (maxFileSize && +fileSize > maxFileSize) {
            console.log('File size is too large', formatBytes(+fileSize), formatBytes(maxFileSize));
            return res.json({
                error: 'File size too large'
            });
        }

        if (extensions && !extensions.includes(fileExt)) {
            console.log('File type is not allowed', fileExt, extensions);
        }

        if (!fileExt.startsWith('.')) fileExt = '.' + fileExt;

        let fileId: string;
        // never overwrite files
        do {
            fileId = generateFileId();
        } while (fs.existsSync(path.resolve(__dirname, '../uploads', fileId + fileExt)))

        const file = fs.createWriteStream(path.resolve(__dirname, '../uploads', fileId + fileExt));

        let total = 0;
        req.on('data', (chunk) => {
            file.write(chunk);
            total += chunk.length;
            console.log('Uploaded', formatBytes(total), formatBytes(+fileSize), `(${Math.round(total / +fileSize * 100)}% )`);
        });

        req.on('end', () => {
            file.end();
            file.close();
            req.file = {
                id: fileId,
                name: fileName,
                size: fileSize,
                type: fileType,
                ext: fileExt,
                contentType
            }
            next();
        });

        req.on('error', (err) => {
            console.log(err);

            res.json({
                error: 'Error uploading file: ' + fileName
            })
        });
    }

    return fn as unknown as NextFunction;
}


/**
 * Description placeholder
 *
 * @typedef {FileCb}
 */
type FileCb = (file: any) => void;
/**
 * Description placeholder
 *
 * @typedef {FileOpts}
 */
type FileOpts = {
    sort?: (a: string, b: string) => number;
    recursive?: boolean;
    filter?: (file: string) => boolean;
}

/**
 * Description placeholder
 *
 * @export
 * @param {string} dir
 * @param {FileCb} cb
 * @param {FileOpts} [options={}]
 */
export function openAllInFolderSync(dir: string, cb: FileCb, options?: FileOpts) {
    if (!dir) throw new Error('No directory specified');
    if (!cb) throw new Error('No callback function specified');

    if (!fs.existsSync(dir)) return;
    if (!fs.lstatSync(dir).isDirectory()) return;
    const files = fs.readdirSync(dir);
    files.sort((a, b) => {
        // put directories first
        const aIsDir = fs.lstatSync(path.resolve(dir, a)).isDirectory();
        const bIsDir = fs.lstatSync(path.resolve(dir, b)).isDirectory();

        return aIsDir ? 1 : bIsDir ? -1 : 0;
    });

    if (!options) options = {};

    if (options.sort) {
        files.sort((a, b) => {
            if (fs.lstatSync(path.resolve(dir, a)).isDirectory() || fs.lstatSync(path.resolve(dir, b)).isDirectory()) return 0;
            return options?.sort ? options.sort(path.resolve(dir, a), path.resolve(dir, b)) : 0 || 0;
        });
    }
    files.forEach(file => {
        const filePath = path.resolve(dir, file);
        if (fs.lstatSync(filePath).isDirectory()) openAllInFolderSync(filePath, cb, options);
        else cb(filePath);
    });
}

/**
 * Description placeholder
 *
 * @export
 * @param {string} dir
 * @param {FileCb} cb
 * @param {FileOpts} [options={}]
 * @returns {Promise<void>}
 */
export function openAllInFolder(dir: string, cb: FileCb, options: FileOpts = {}): Promise<void> {
    if (!dir) throw new Error('No directory specified');
    if (!cb) throw new Error('No callback function specified');
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(dir)) return resolve();
        if (!fs.lstatSync(dir).isDirectory()) return resolve();

        fs.readdir(dir, (err, files) => {
            if (err) return reject(err);
            files.forEach(file => {
                const filePath = path.resolve(dir, file);
                if (fs.lstatSync(filePath).isDirectory()) openAllInFolder(filePath, cb);
                else cb(filePath);
            });
        });
    });
}


/**
 * Description placeholder
 *
 * @export
 * @enum {number}
 */
export enum LogType {
    request = 'request',
    error = 'error',
    debugger = 'debugger',
    status = 'status'
}

/**
 * Description placeholder
 *
 * @export
 * @typedef {LogObj}
 */
export type LogObj = {
    [key: string]: string|number|boolean|undefined|null;
}

if (!fs.existsSync(path.resolve(__dirname, '../logs'))) fs.mkdirSync(path.resolve(__dirname, '../logs'));

/**
 * Description placeholder
 *
 * @export
 * @async
 * @param {LogType} type
 * @param {LogObj} dataObj
 * @returns {unknown}
 */
export async function log(type: LogType, dataObj: LogObj) {
    return new ObjectsToCsv([dataObj]).toDisk(
        path.resolve(__dirname, `../logs/${type}.csv`), 
        { append: true }
    );
}