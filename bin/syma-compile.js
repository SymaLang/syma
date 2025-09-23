#!/usr/bin/env node

/*****************************************************************
 * Syma Module Compiler CLI
 *
 * Command-line interface for compiling Syma source files (.syma) to JSON AST format.
 * Uses the abstracted module compiler from core/module-compiler.js
 ******************************************************************/

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { glob } from 'glob';
import { createParser } from '../src/core/parser-factory.js';
import { Module, ModuleCompiler } from '../src/core/module-compiler.js';
import { NodeModulePlatform } from '../src/platform/node-module-platform.js';
import { isSym, isCall } from '../src/ast-helpers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ---------------- Main Compiler ---------------- */
async function compile(options) {
  const { files, bundle, entry, output, pretty, format, stdlibPath, library } = options;

  // Use tree-sitter parser by default, fallback to original if it fails
  const parser = await createParser({ useTreeSitter: true });

  // Format mode - pretty print .syma files
  if (format) {
    if (files.length !== 1) {
      throw new Error('Format mode requires exactly one input file');
    }

    const content = fs.readFileSync(files[0], 'utf-8');

    // Use formatSource if available (tree-sitter parser), otherwise fallback to prettyPrint
    let formatted;
    if (parser.formatSource) {
      // Tree-sitter parser with comment preservation
      formatted = parser.formatSource(content, {
        preserveComments: true,
        preserveNewlines: true,
        preserveIndentation: false,
        indentSize: 2
      });
    } else {
      // Fallback to old method (loses comments)
      console.warn('Warning: Using legacy formatter that strips comments. Consider using tree-sitter parser.');
      const ast = parser.parseString(content, files[0]);
      formatted = parser.prettyPrint(ast);
    }

    if (output) {
      fs.writeFileSync(output, formatted);
    } else {
      console.log(formatted);
    }
    return;
  }

  if (bundle) {
    // Module bundling mode using abstracted compiler
    const platform = new NodeModulePlatform({
      stdlibPath,
      parser
    });
    const compiler = new ModuleCompiler(platform);

    // Determine entry module
    let entryModuleName = entry;
    let entryFile = null;

    if (!entry && files.length === 1) {
      // If no entry specified and only one file, use that file's module as entry
      const content = fs.readFileSync(files[0], 'utf-8');
      const ast = parser.parseString(content, files[0]);

      if (isCall(ast) && isSym(ast.h) && ast.h.v === 'Module') {
        const nameNode = ast.a[0];
        if (isSym(nameNode)) {
          entryModuleName = nameNode.v;
          entryFile = files[0];
        }
      }

      if (!entryModuleName) {
        throw new Error('Could not determine entry module from single file');
      }
    } else if (!entry) {
      throw new Error('--entry is required when bundling multiple module files');
    }

    // Load all provided files first
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      const ast = parser.parseString(content, file);

      if (isCall(ast) && isSym(ast.h) && ast.h.v === 'Module') {
        const nameNode = ast.a[0];
        if (isSym(nameNode)) {
          // Pre-cache this module in the platform
          await platform.loadModuleFromPath(file);

          if (!entryFile && nameNode.v === entryModuleName) {
            entryFile = file;
          }
        }
      }
    }

    if (!entryFile) {
      throw new Error(`Entry module ${entryModuleName} not found in provided files`);
    }

    // Load entry module and dependencies recursively
    await platform.loadModuleFromPath(entryFile);

    // Try to load Core/Syntax/Global if it exists
    try {
      if (await platform.moduleExists('Core/Syntax/Global')) {
        await compiler.loadModuleRecursive('Core/Syntax/Global');
        // Don't log to stderr as it may be treated as error
      }
    } catch (error) {
      // Silently ignore if Core/Syntax/Global doesn't exist
    }

    // Compile with the abstracted compiler
    const universe = await compiler.compile(entryModuleName, { libraryMode: library });

    const json = JSON.stringify(universe, null, pretty ? 2 : 0);
    if (output) {
      fs.writeFileSync(output, json);
      console.log(`# Bundled ${compiler.loadedModules.size} modules to ${output}`);
    } else {
      console.log(json);
    }

  } else {
    // Single file mode
    if (files.length !== 1) {
      throw new Error('Single file mode requires exactly one input file');
    }

    const content = fs.readFileSync(files[0], 'utf-8');
    const ast = parser.parseString(content, files[0]);

    // Check if it's a module - if so, compile it properly with dependencies
    if (isCall(ast) && isSym(ast.h) && ast.h.v === 'Module') {
      const nameNode = ast.a[0];
      if (isSym(nameNode)) {
        const moduleName = nameNode.v;

        // Use the module compiler for proper compilation
        const platform = new NodeModulePlatform({
          stdlibPath,
          parser
        });
        const compiler = new ModuleCompiler(platform);

        // Load the module
        await platform.loadModuleFromPath(files[0]);

        // Try to load Core/Syntax/Global if it exists
        try {
          if (await platform.moduleExists('Core/Syntax/Global')) {
            await compiler.loadModuleRecursive('Core/Syntax/Global');
          }
        } catch (error) {
          // Silently ignore if Core/Syntax/Global doesn't exist
        }

        // Compile with dependencies
        const universe = await compiler.compile(moduleName, { libraryMode: false });

        const json = JSON.stringify(universe, null, pretty ? 2 : 0);
        if (output) {
          fs.writeFileSync(output, json);
          console.log(`# Compiled module ${moduleName} with ${compiler.loadedModules.size} dependencies to ${output}`);
        } else {
          console.log(json);
        }
      } else {
        throw new Error('Module name must be a symbol');
      }
    } else {
      // Not a module, just output the AST
      const json = JSON.stringify(ast, null, pretty ? 2 : 0);
      if (output) {
        fs.writeFileSync(output, json);
      } else {
        console.log(json);
      }
    }
  }
}

/* ---------------- CLI ---------------- */
function printUsage() {
  console.log(`
Syma Module Compiler

Usage:
  syma-compile <file> [options]                     # Single file mode
  syma-compile <file> --bundle                      # Bundle with auto-detected entry
  syma-compile <files...> --bundle --entry <name>   # Bundle with explicit entry
  syma-compile <file> --library                    # Bundle as library (no Program required)
  syma-compile <file> --format                      # Format/pretty-print mode

Options:
  -o, --out <file>      Output file (default: stdout)
  --pretty              Pretty-print JSON output
  --bundle              Bundle modules with dependencies
  --library             Bundle as library (doesn't require Program section)
  --entry <name>        Entry module name (optional for single file)
  --stdlib <path>       Path to standard library modules
  --format, -f          Format/pretty-print .syma file
  -h, --help            Show this help

Examples:
  # Compile single file
  syma-compile input.syma --out output.json --pretty

  # Bundle single module with dependencies (auto-detects entry)
  syma-compile src/main.syma --bundle --out universe.json

  # Bundle multiple modules with explicit entry
  syma-compile src/*.syma --bundle --entry App/Main --out universe.json

  # Bundle library modules (no Program required)
  syma-compile src/stdlib/core-kv.syma --library --out kv-lib.json

  # Format/pretty-print a .syma file
  syma-compile messy.syma --format --out clean.syma
  syma-compile messy.syma -f  # Print to stdout

  # Use with REPL
  syma-compile app.syma --out app.json && syma-repl --load app.json
`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
    printUsage();
    process.exit(0);
  }

  const options = {
    files: [],
    bundle: false,
    library: false,
    entry: null,
    output: null,
    pretty: false,
    format: false,
    stdlibPath: null
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '-o':
      case '--out':
        options.output = args[++i];
        break;

      case '--pretty':
        options.pretty = true;
        break;

      case '--bundle':
        options.bundle = true;
        break;

      case '--library':
        options.bundle = true;  // Library mode is a type of bundling
        options.library = true;
        break;

      case '--entry':
        options.entry = args[++i];
        break;

      case '--stdlib':
        options.stdlibPath = args[++i];
        break;

      case '--format':
      case '-f':
        options.format = true;
        break;

      default:
        if (arg.startsWith('-')) {
          console.error(`Unknown option: ${arg}`);
          process.exit(1);
        }
        // Expand globs
        const expanded = await glob(arg);
        if (expanded.length === 0) {
          console.error(`No files matching: ${arg}`);
          process.exit(1);
        }
        options.files.push(...expanded);
    }
  }

  if (options.files.length === 0) {
    console.error('No input files specified');
    process.exit(1);
  }

  try {
    await compile(options);
  } catch (error) {
    console.error(`Compilation failed: ${error.message}`);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});