#!/usr/bin/env node

/*****************************************************************
 * Syma REPL CLI Entry Point
 *
 * Command-line interface for the Syma symbolic language REPL
 ******************************************************************/

import { SymaREPL } from '../src/repl/repl.js';
import { NodePlatform } from '../src/platform/node.js';
import { setPlatform } from '../src/platform/index.js';
import { createRequire } from 'module';
import * as path from 'path';
import * as fs from 'fs';

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
        executeExpr: null,
        maxSteps: 10000
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
                }
                break;

            case '--max-steps':
                if (i + 1 < args.length) {
                    options.maxSteps = parseInt(args[++i]);
                }
                break;

            default:
                // If no flag, treat as file to load
                if (!arg.startsWith('-')) {
                    options.loadFile = arg;
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
Syma REPL - Interactive Symbolic Language Environment

Usage: syma-repl [options] [file]

Options:
  -h, --help           Show this help message
  -v, --version        Show version information
  -t, --trace          Enable trace mode
  -l, --load <file>    Load a universe file on startup
  -e, --eval <expr>    Evaluate expression and exit
  --history <file>     History file (default: .syma_history)
  --no-history         Disable history
  --rc <file>          RC file to load (default: .symarc)
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
  syma-repl                        # Start interactive REPL
  syma-repl todo.syma              # Load file and start REPL
  syma-repl -e "{Add 1 2}"         # Evaluate expression
  syma-repl --trace                # Start with tracing enabled
`);
}

function showVersion() {
    console.log(`Syma REPL v${packageInfo.version || '1.0.0'}`);
    console.log(`Node.js ${process.version}`);
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

    // Create REPL
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

    try {
        // Initialize REPL
        await repl.init();

        // Load file if specified
        if (options.loadFile) {
            try {
                await repl.loadFile(options.loadFile);
                platform.print(`Loaded: ${options.loadFile}`);
            } catch (error) {
                platform.print(`Error loading file: ${error.message}`);
            }
        }

        // If expression provided, evaluate and exit
        if (options.executeExpr) {
            try {
                await repl.evaluateExpression(options.executeExpr);
            } catch (error) {
                platform.print(`Error: ${error.message}`);
                process.exit(1);
            }
            process.exit(0);
        }

        // Start interactive REPL
        await repl.run();

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