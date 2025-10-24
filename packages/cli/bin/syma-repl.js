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
import { createNodeAutocompleter } from '../src/repl/repl-node.js';
import { NodePlatform } from '@syma/platform-node';
import { setPlatform } from '@syma/core/platform';
import { createRequire } from 'module';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { spawn } from 'child_process';
import { createParser } from '@syma/core/parser-factory';
import * as engine from '@syma/core/engine';
import { foldPrims } from '@syma/core/primitives';
import { createEffectsProcessor } from '@syma/core/effects/processor';
import { isCall, isSym } from '@syma/core/ast-helpers';
import { parseProgramArgsToKV } from '../src/utils/args-parser.js';

const require = createRequire(import.meta.url);
const packageInfo = require('../package.json');

// Expand tilde in file paths
function expandTilde(filePath) {
    if (!filePath) return filePath;
    if (filePath.startsWith('~/')) {
        return path.join(os.homedir(), filePath.slice(2));
    }
    return filePath;
}

// Parse command-line arguments
function parseArgs() {
    const args = process.argv.slice(2);
    const options = {
        help: false,
        version: false,
        trace: false,
        historyFile: expandTilde('~/.syma_history'),
        rcFile: expandTilde('~/.symarc'),
        loadFile: null,
        runFile: null,  // New: file to run directly
        executeExpr: null,
        maxSteps: 10000,
        replMode: true,   // Default to REPL mode
        programArgs: []  // Arguments to pass to the program (after --)
    };

    // Check if there's a -- separator
    const separatorIndex = args.indexOf('--');
    let mainArgs = args;

    if (separatorIndex !== -1) {
        // Split arguments: before -- for syma, after -- for the program
        mainArgs = args.slice(0, separatorIndex);
        options.programArgs = args.slice(separatorIndex + 1);
    }

    for (let i = 0; i < mainArgs.length; i++) {
        const arg = mainArgs[i];

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
                if (i + 1 < mainArgs.length) {
                    options.historyFile = expandTilde(mainArgs[++i]);
                }
                break;

            case '--rc':
                if (i + 1 < mainArgs.length) {
                    options.rcFile = expandTilde(mainArgs[++i]);
                }
                break;

            case '--no-rc':
                options.rcFile = null;
                break;

            case '-l':
            case '--load':
                if (i + 1 < mainArgs.length) {
                    options.loadFile = mainArgs[++i];
                }
                break;

            case '-e':
            case '--eval':
                if (i + 1 < mainArgs.length) {
                    options.executeExpr = mainArgs[++i];
                    options.replMode = false;
                }
                break;

            case '--max-steps':
                if (i + 1 < mainArgs.length) {
                    options.maxSteps = parseInt(mainArgs[++i]);
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
  syma [options] [file] [-- args]  # Run a program with arguments
  syma <file.syma>                 # Run a Syma program
  syma <file.json>                 # Run compiled universe
  syma                             # Start interactive REPL

Options:
  -h, --help           Show this help message
  -v, --version        Show version information
  -t, --trace          Enable trace mode
  -l, --load <file>    Load a file in REPL mode
  -e, --eval <expr>    Evaluate expression and exit
  --history <file>     History file (default: ~/.syma_history)
  --no-history         Disable history
  --rc <file>          RC file for REPL (default: ~/.symarc)
  --no-rc              Don't load RC file
  --max-steps <n>      Maximum normalization steps (default: 10000)

Program Arguments:
  Arguments after -- are passed to the program's {Args} section
  --key value          Creates {KV "key" "value"}
  --flag               Creates {KV "flag" Empty}
  -x value             Creates {KV "x" "value"}
  positional           Creates {KV 0 "positional"} (numbered)

REPL Commands:
  :help                Show available commands
  :quit                Exit the REPL

Examples:
  syma                             # Start interactive REPL
  syma hello.syma                  # Run a Syma program
  syma universe.json               # Run compiled universe
  syma -e "{Add 1 2}"              # Evaluate expression
  syma -l todo.syma                # Load file and start REPL
  syma --trace program.syma        # Run with tracing enabled
  syma prog.syma -- --input file.txt --verbose  # Run with args
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
    // Check if file exists
    if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
    }

    const parser = await createParser({ useTreeSitter: true });
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

    // Inject command-line arguments if the program has an {Args} section
    if (options.programArgs && options.programArgs.length > 0) {
        const program = engine.getProgram(universe);
        if (program) {
            // Find the {Args} node in the program
            const argsIndex = program.a.findIndex(n =>
                isCall(n) && isSym(n.h) && n.h.v === 'Args'
            );

            if (argsIndex !== -1) {
                // Parse arguments into KV nodes
                const kvNodes = parseProgramArgsToKV(options.programArgs);

                // Create new program with injected arguments
                const newProgram = {
                    ...program,
                    a: [...program.a]
                };

                // Replace the Args node with Args containing the KV pairs
                newProgram.a[argsIndex] = {
                    k: 'Call',
                    h: { k: 'Sym', v: 'Args' },
                    a: kvNodes
                };

                // Update universe with new program
                universe = engine.setProgram(universe, newProgram);

                if (options.trace) {
                    platform.print(`Injected ${kvNodes.length} argument(s) into {Args} section\n`);
                }
            } else if (options.trace) {
                platform.print(`Note: Program has no {Args} section, skipping argument injection\n`);
            }
        }
    }

    // Ensure universe has Effects structure
    universe = engine.enrichProgramWithEffects(universe);

    // Apply RuleRules to transform the Universe permanently
    universe = engine.applyRuleRules(universe, foldPrims);

    // Extract rules (now from the transformed universe)
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
    // Check periodically if there are still pending effects or active I/O
    let waitCount = 0;
    const maxWait = 6000;  // Wait up to 60 seconds for I/O operations

    while (waitCount < maxWait) {
        await new Promise(resolve => platform.setTimeout(resolve, 10));

        // Check if there are pending effects
        const program = engine.getProgram(universe);
        const effects = program.a.find(n => isCall(n) && isSym(n.h) && n.h.v === 'Effects');

        let hasPending = false;
        if (effects) {
            const pending = effects.a[0];
            if (isCall(pending) && pending.a.length > 0) {
                hasPending = true;
            }
        }

        // Also check if there are active I/O operations or timers
        const hasActiveIO = effectsProcessor && effectsProcessor.hasActiveIO && effectsProcessor.hasActiveIO();
        const hasActiveTimers = effectsProcessor && effectsProcessor.hasActiveTimers && effectsProcessor.hasActiveTimers();

        // If no pending effects, no active I/O, and no active timers, we can exit
        if (!hasPending && !hasActiveIO && !hasActiveTimers) {
            break;
        }

        waitCount++;
    }

    // Clean up
    if (effectsProcessor && effectsProcessor.cleanup) {
        effectsProcessor.cleanup();
    }
}

export async function main() {
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
            const replOptions = {
                trace: options.trace,
                maxSteps: options.maxSteps
            };
            const repl = new SymaREPL(platform, replOptions);
            // Add Node.js autocompleter
            repl.autocompleter = createNodeAutocompleter(repl.commandProcessor);
            await repl.init();
            await repl.evaluateExpression(options.executeExpr);
            await repl.shutdown();
            process.exit(0);
        } else {
            // REPL mode
            const replOptions = {
                historyFile: options.historyFile,
                rcFile: options.rcFile,
                trace: options.trace,
                maxSteps: options.maxSteps,
                maxHistory: 1000,
                maxUndo: 50
            };
            const repl = new SymaREPL(platform, replOptions);
            // Add Node.js autocompleter
            repl.autocompleter = createNodeAutocompleter(repl.commandProcessor);

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

            // Ensure clean exit after REPL completes
            process.exit(0);
        }
    } catch (error) {
        // User-friendly error messages
        if (error.code === 'ENOENT') {
            console.error(`Error: File not found: ${error.path || options.runFile}`);
        } else if (error.message.includes('File not found')) {
            console.error(`Error: ${error.message}`);
        } else if (error.syscall) {
            // Other system errors
            console.error(`Error: ${error.message}`);
        } else {
            // Other errors - show full details
            console.error('Fatal error:', error.message);
            if (process.env.DEBUG) {
                console.error(error.stack);
            }
        }
        process.exit(1);
    }
}

// Run the REPL if invoked directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(error => {
        // This should rarely be hit since main() has its own error handler
        if (error.code === 'ENOENT') {
            console.error(`Error: File not found: ${error.path}`);
        } else {
            console.error('Unhandled error:', error.message);
            if (process.env.DEBUG) {
                console.error(error.stack);
            }
        }
        process.exit(1);
    });
}