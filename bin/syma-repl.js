#!/usr/bin/env node

/*****************************************************************
 * Syma Runtime and REPL CLI
 *
 * Command-line interface for running Syma programs and interactive REPL
 * Usage:
 *   syma                          # Start interactive REPL
 *   syma script.syma              # Run a Syma program
 *   syma script.json              # Run compiled universe
 ******************************************************************/

import { SymaREPL } from '../src/repl/repl.js';
import { NodePlatform } from '../src/platform/node.js';
import { setPlatform } from '../src/platform/index.js';
import { createRequire } from 'module';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';
import { promisify } from 'util';
import { SymaParser } from '../src/core/parser.js';
import * as engine from '../src/core/engine.js';
import { foldPrims } from '../src/primitives.js';
import { createEffectsProcessor } from '../src/effects/processor.js';
import { isCall, isSym } from '../src/ast-helpers.js';

const require = createRequire(import.meta.url);
const packageInfo = require('../package.json');

// Parse command-line arguments
function parseArgs() {
    const args = process.argv.slice(2);
    const options = {
        help: false,
        version: false,
        trace: false,
        historyFile: '.syma_history',
        rcFile: '.symarc',
        loadFile: null,
        runFile: null,  // New: file to run directly
        executeExpr: null,
        maxSteps: 10000,
        replMode: true   // Default to REPL mode
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        switch (arg) {
            case '-h':
            case '--help':
                options.help = true;
                break;

            case '-v':
            case '--version':
                options.version = true;
                break;

            case '-t':
            case '--trace':
                options.trace = true;
                break;

            case '--no-history':
                options.historyFile = null;
                break;

            case '--history':
                if (i + 1 < args.length) {
                    options.historyFile = args[++i];
                }
                break;

            case '--rc':
                if (i + 1 < args.length) {
                    options.rcFile = args[++i];
                }
                break;

            case '--no-rc':
                options.rcFile = null;
                break;

            case '-l':
            case '--load':
                if (i + 1 < args.length) {
                    options.loadFile = args[++i];
                }
                break;

            case '-e':
            case '--eval':
                if (i + 1 < args.length) {
                    options.executeExpr = args[++i];
                    options.replMode = false;
                }
                break;

            case '--max-steps':
                if (i + 1 < args.length) {
                    options.maxSteps = parseInt(args[++i]);
                }
                break;

            default:
                // If no flag, treat as file to run
                if (!arg.startsWith('-')) {
                    options.runFile = arg;
                    options.replMode = false;  // Run mode, not REPL
                } else {
                    console.error(`Unknown option: ${arg}`);
                    process.exit(1);
                }
        }
    }

    return options;
}

function showHelp() {
    console.log(`
Syma Runtime - Execute Syma Programs and Interactive REPL

Usage:
  syma [options] [file]            # Run a program or start REPL
  syma <file.syma>                 # Run a Syma program
  syma <file.json>                 # Run compiled universe
  syma                             # Start interactive REPL

Options:
  -h, --help           Show this help message
  -v, --version        Show version information
  -t, --trace          Enable trace mode
  -l, --load <file>    Load a file in REPL mode
  -e, --eval <expr>    Evaluate expression and exit
  --history <file>     History file (default: .syma_history)
  --no-history         Disable history
  --rc <file>          RC file for REPL (default: .symarc)
  --no-rc              Don't load RC file
  --max-steps <n>      Maximum normalization steps (default: 10000)

REPL Commands:
  :help                Show available commands
  :quit                Exit the REPL
  :save <file>         Save universe to file
  :load <file>         Load universe from file
  :rules               List all rules
  :rule <name>         Show or define a rule
  :trace <expr>        Evaluate with trace
  :undo                Undo last modification

Examples:
  syma                             # Start interactive REPL
  syma hello.syma                  # Run a Syma program
  syma universe.json               # Run compiled universe
  syma -e "{Add 1 2}"              # Evaluate expression
  syma -l todo.syma                # Load file and start REPL
  syma --trace program.syma        # Run with tracing enabled
`);
}

function showVersion() {
    console.log(`Syma REPL v${packageInfo.version || '1.0.0'}`);
    console.log(`Node.js ${process.version}`);
}

/**
 * Compile a .syma file to universe AST
 */
async function compileSymaFile(filePath, platform) {
    const parser = new SymaParser();
    const content = await fs.promises.readFile(filePath, 'utf-8');
    const ast = parser.parseString(content, filePath);

    // Check if it's a module
    if (isCall(ast) && isSym(ast.h) && ast.h.v === 'Module') {
        // It's a module - we need to bundle it
        const nameNode = ast.a[0];
        if (!isSym(nameNode)) {
            throw new Error('Module name must be a symbol');
        }
        const moduleName = nameNode.v;

        // Use the compiler to bundle
        return new Promise((resolve, reject) => {
            const compilerPath = path.join(path.dirname(new URL(import.meta.url).pathname), 'syma-compile.js');
            const args = [
                compilerPath,
                filePath,
                '--bundle',
                '--entry', moduleName
            ];

            const child = spawn('node', args, {
                stdio: ['ignore', 'pipe', 'pipe']
            });

            let stdout = '';
            let stderr = '';

            child.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            child.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            child.on('error', (error) => {
                reject(error);
            });

            child.on('close', (code) => {
                if (code === 0) {
                    try {
                        const universe = JSON.parse(stdout);
                        resolve(universe);
                    } catch (error) {
                        reject(new Error(`Failed to parse compiled output: ${error.message}`));
                    }
                } else {
                    reject(new Error(`Compilation failed: ${stderr || 'Unknown error'}`));
                }
            });
        });
    } else {
        // It's a plain expression/universe - return as is
        return ast;
    }
}

/**
 * Run a Syma program (not REPL mode)
 */
async function runProgram(filePath, platform, options) {
    let universe;

    // Load/compile the file
    if (filePath.endsWith('.json')) {
        // Load pre-compiled universe
        const content = await fs.promises.readFile(filePath, 'utf-8');
        universe = JSON.parse(content);
    } else if (filePath.endsWith('.syma')) {
        // Compile .syma file
        if (options.trace) {
            platform.print(`Compiling ${filePath}...`);
        }
        universe = await compileSymaFile(filePath, platform);
    } else {
        throw new Error(`Unknown file type: ${filePath}`);
    }

    // Ensure universe has Effects structure
    universe = engine.enrichProgramWithEffects(universe);

    // Extract rules
    const rules = engine.extractRules(universe);

    // Create effects processor
    let programRunning = true;
    const effectsProcessor = createEffectsProcessor(
        platform,
        () => engine.getProgram(universe),
        (newProg) => {
            // After effects update, normalize to trigger inbox processing rules
            const normalized = engine.normalize(newProg, rules, options.maxSteps, false, foldPrims);
            universe = engine.setProgram(universe, normalized);
        },
        () => {
            // Effects were processed
        }
    );

    // Get the initial program
    const program = engine.getProgram(universe);

    // Normalize the program to execute it
    if (options.trace) {
        const { result, trace } = engine.normalizeWithTrace(
            program,
            rules,
            options.maxSteps,
            false,
            foldPrims
        );
        universe = engine.setProgram(universe, result);

        // Show trace
        if (trace.length > 0) {
            platform.print('\nExecution trace:');
            for (const step of trace) {
                platform.print(`  [${step.i}] Rule "${step.rule}" at path [${step.path.join(',')}]`);
            }
        }
    } else {
        const normalized = engine.normalize(
            program,
            rules,
            options.maxSteps,
            false,
            foldPrims
        );
        universe = engine.setProgram(universe, normalized);
    }

    // Give effects processor time to process any pending effects
    // Check periodically if there are still pending effects
    let waitCount = 0;
    const maxWait = 100;  // Wait up to 1 second for effects

    while (waitCount < maxWait) {
        await new Promise(resolve => platform.setTimeout(resolve, 10));

        // Check if there are pending effects
        const program = engine.getProgram(universe);
        const effects = program.a.find(n => isCall(n) && isSym(n.h) && n.h.v === 'Effects');
        if (effects) {
            const pending = effects.a[0];
            if (isCall(pending) && pending.a.length === 0) {
                // No pending effects, we can exit
                break;
            }
        }
        waitCount++;
    }

    // Clean up
    if (effectsProcessor && effectsProcessor.cleanup) {
        effectsProcessor.cleanup();
    }
}

async function main() {
    const options = parseArgs();

    if (options.help) {
        showHelp();
        process.exit(0);
    }

    if (options.version) {
        showVersion();
        process.exit(0);
    }

    // Create and set platform
    const platform = new NodePlatform({
        storagePath: '.syma-storage.json',
        historyPath: options.historyFile
    });
    setPlatform(platform);

    try {
        // Check if we're in run mode or REPL mode
        if (options.runFile) {
            // Run mode - execute file and exit
            await runProgram(options.runFile, platform, options);
            process.exit(0);
        } else if (options.executeExpr) {
            // Expression evaluation mode
            const repl = new SymaREPL(platform, {
                trace: options.trace,
                maxSteps: options.maxSteps
            });
            await repl.init();
            await repl.evaluateExpression(options.executeExpr);
            await repl.shutdown();
            process.exit(0);
        } else {
            // REPL mode
            const repl = new SymaREPL(platform, {
                historyFile: options.historyFile,
                rcFile: options.rcFile,
                trace: options.trace,
                maxSteps: options.maxSteps,
                maxHistory: 1000,
                maxUndo: 50
            });

            // Handle Ctrl+C gracefully
            process.on('SIGINT', async () => {
                console.log('\n\nInterrupted.');
                await repl.shutdown();
                process.exit(0);
            });

            // Initialize REPL
            await repl.init();

            // Load file if specified with -l
            if (options.loadFile) {
                try {
                    await repl.loadFile(options.loadFile);
                    platform.print(`Loaded: ${options.loadFile}`);

                    // Give effects processor a moment to process any pending effects
                    await new Promise(resolve => platform.setTimeout(resolve, 50));
                } catch (error) {
                    platform.print(`Error loading file: ${error.message}`);
                }
            }

            // Start interactive REPL
            await repl.run();
        }
    } catch (error) {
        console.error('Fatal error:', error);
        process.exit(1);
    }
}

// Run the REPL
main().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
});