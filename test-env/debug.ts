import { DB } from '../server-functions/databases';
import { LogType, log, getJSON } from '../server-functions/files';
import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';



enum Color {
    red = '\x1b[31m',
    green = '\x1b[32m',
    yellow = '\x1b[33m',
    blue = '\x1b[34m',
    magenta = '\x1b[35m',
    cyan = '\x1b[36m',
    white = '\x1b[37m',
    reset = '\x1b[0m'
}

export type Result = {
    result: any;
    success: boolean;
    reason: failReason;
    expected: any;
    error?: Error;
}

enum failReason {
    valueMismatch = 'Value Mismatch',
    typeMismatch = 'Type Mismatch',
    valueTypeMismatch = 'Value and Type Mismatch',
    unknown = 'Unknown',

    error = 'Error',
    success = 'Success'
}

export class Test {
    constructor(
        public readonly name: string, 
        public readonly expect: any, 
        public readonly test: ((db?: DB) => Promise<any>) | (() => any)
    ) {}
}


const runTest = async(test: Test, db: DB) => {
    let r: Result;
    let expect: any;
    let result: any;

    try {
        result = await test.test(db);
        expect = test.expect === undefined ? true : test.expect;
    } catch (e) {
        return {
            result: undefined,
            success: false,
            reason: failReason.error,
            expected: test.expect,
            error: e
        }
    }

    return {
        result,
        expected: test.expect,
        success: result === expect,
        reason: (() => {
            if (result === expect) return failReason.success;
            if (result == expect && result !== expect) return failReason.typeMismatch;
            if (typeof result !== typeof expect && result != expect) return failReason.valueTypeMismatch;
            if (result != expect) return failReason.valueMismatch;
            return failReason.unknown;
        })()
    };
}

const run = async(tests: Test[], db: DB) => {
    console.clear();
    const cols = process.stdout.columns;

    let numPassed = 0;

    const maxNameLength = Math.max(...tests.map(t => t.name.length));

    for (const test of tests) {
        const start = Date.now();
        const { success, reason, expected, result, error } = await runTest(test, db);
        const end = Date.now();
        const delta = end - start;

        let reasonColor: Color;

        switch (reason) {
            case failReason.error:
                reasonColor = Color.red;
                break;
            case failReason.success:
                reasonColor = Color.green;
                break;
            case failReason.typeMismatch:
                reasonColor = Color.yellow;
                break;
            case failReason.valueMismatch:
                reasonColor = Color.blue;
                break;
            case failReason.valueTypeMismatch:
                reasonColor = Color.magenta;
                break;
            case failReason.unknown:
                reasonColor = Color.cyan;
                break;
        }

        let resultColor: Color;

        if (success) {
            resultColor = Color.green;
            numPassed++;
        } else {
            resultColor = Color.red;
        }

        const name = resultColor + test.name + Color.reset;
        const nameDots = ('.').repeat(maxNameLength - test.name.length);
        const emoji = success ? '✅' : '❌';

        const output = (
            success ? 
            Color.green + 'Passed' : 
            `Expected ${expected} (${typeof expected}) but got ${result} (${typeof result}) - ${reasonColor}${reason}`) + Color.reset;


        const outputString = `${name} ${nameDots} ${output}${Color.reset} `;
        const endEmoji = ` | ${emoji} ${delta}ms`;
        const endDots = ('.').repeat((cols + 21) - outputString.length - endEmoji.length);
        console.log(outputString + endDots + endEmoji);
        
        await log(LogType.debugger, {
            date: new Date().toISOString(),
            name: test.name,
            result,
            expected,
            success,
            reason,
            error: error ? error.toString() : undefined
        });
    }

    console.log(`\n\n` + ('-').repeat(cols));

    const rate = Math.round(numPassed / tests.length * 100);

    const color = rate == 100 ? Color.green : Color.red;
    const output = ` ${color + rate + Color.reset}% | ${numPassed}/${tests.length} passed`;

    const beginningString = 'Tests completed: ';
    const dots = ('.').repeat((cols + 9) - beginningString.length - output.length);

    const outputString = beginningString + dots + output;

    console.log(outputString);
}



const runTs = async (filePath: string): Promise<any> => {
    return new Promise(async (res, rej) => {
        const tsConfig = await getJSON(path.resolve(__dirname, filePath, './tsconfig.json'));

        const program = ts.createProgram([filePath], {
            ...tsConfig.compilerOptions,
            noEmitOnError: true
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
            console.error(new Error('There was an error compiling the project'));
        }

        res(null);
    });
}












(async() => {
    const dbPath = path.resolve(__dirname, '../db/main.db');
    const copy = path.resolve(__dirname, '../db/debug.db');

    if (fs.existsSync(copy)) fs.unlinkSync(copy);
    fs.copyFileSync(dbPath, copy);

    const db = new DB('debug');

    await runTs(path.resolve(__dirname, './tests/'));



    const tests = fs.readdirSync(path.resolve(__dirname, './tests')).map(file => {
        if (file.endsWith('.js')) {
            file = file.replace('.js', '');
            console.log('Imported test:', file);
            return require('./tests' + file);
        }
    });



    // for testing the debugger
    // const tests = new Array(100).fill(0).map((_, i) => {
    //     const generateRandom = () => {
    //         const num = Math.floor(Math.random() * 10);
    //         const str = Math.random() > 0.5 ? '' : 0;
    //         return (num as unknown as string) + str;
    //     }

    //     return {
    //         name: `Test ${i}`,
    //         expect: generateRandom(),
    //         test: async(db: DB) => {
    //             return generateRandom();
    //         }
    //     }
    // });

    try {

        await run(tests, db);

    } catch (e) {
        if ((e as Error).toString().includes('Invalid count value')) {
            console.error('Please zoom out of the terminal window, the output is too large to fit on the screen.');
        }
    }

    try {
        fs.unlinkSync(copy);
    } catch (e) {
        // console.error(e);
    }
})();