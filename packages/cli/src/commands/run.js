/**
 * syma run - Run a Syma program
 */

import { parsePackageSyma } from '../pm/parser.js';
import { NodePlatform } from '@syma/platform-node';
import { setPlatform } from '@syma/core/platform';
import { createParser } from '@syma/core/parser-factory';
import * as engine from '@syma/core/engine';
import { foldPrims } from '@syma/core/primitives';
import { createEffectsProcessor } from '@syma/core/effects/processor';
import { isCall, isSym } from '@syma/core/ast-helpers';
import path from 'path';
import fs from 'fs/promises';
import { spawn } from 'child_process';

export async function runCommand(args) {
  // Parse flags and arguments
  let trace = false;
  let maxSteps = 10000;
  let entryFile = null;

  // Parse program arguments (after --)
  const separatorIndex = args.indexOf('--');
  let programArgs = [];
  if (separatorIndex !== -1) {
    programArgs = args.slice(separatorIndex + 1);
    args = args.slice(0, separatorIndex);
  }

  // Parse flags
  const filteredArgs = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--trace' || arg === '-t') {
      trace = true;
    } else if (arg === '--max-steps') {
      maxSteps = parseInt(args[++i], 10);
    } else if (!arg.startsWith('-')) {
      filteredArgs.push(arg);
    }
  }

  // First non-flag argument is the entry file
  entryFile = filteredArgs[0];

  // If no file specified, try to load from package.syma
  if (!entryFile) {
    const pkg = await parsePackageSyma();
    if (pkg && pkg.entry) {
      entryFile = pkg.entry;
      // console.log(`Running entry: ${entryFile}`);
    } else {
      console.error('Error: No entry file specified and no package.syma found');
      console.error('Usage: syma run <file> [-- args]');
      process.exit(1);
    }
  }

  // Create and set platform
  const platform = new NodePlatform({
    storagePath: '.syma-storage.json'
  });
  setPlatform(platform);

  try {
    const fullPath = path.resolve(process.cwd(), entryFile);

    // Load/compile the file
    let universe;

    if (fullPath.endsWith('.json')) {
      // Load pre-compiled universe
      const content = await fs.readFile(fullPath, 'utf-8');
      universe = JSON.parse(content);
    } else if (fullPath.endsWith('.syma')) {
      // Compile .syma file
      universe = await compileSymaFile(fullPath, platform);
    } else {
      throw new Error(`Unknown file type: ${fullPath}`);
    }

    // Ensure universe has Effects structure
    universe = engine.enrichProgramWithEffects(universe);

    // Apply RuleRules
    universe = engine.applyRuleRules(universe, foldPrims);

    // Extract rules
    const rules = engine.extractRules(universe);

    // Create effects processor
    const effectsProcessor = createEffectsProcessor(
      platform,
      () => engine.getProgram(universe),
      (newProg) => {
        const normalized = engine.normalize(newProg, rules, maxSteps, false, foldPrims);
        universe = engine.setProgram(universe, normalized);
      },
      () => {}
    );

    // Get the initial program
    const program = engine.getProgram(universe);

    // Normalize the program
    if (trace) {
      const { result, trace: traceSteps } = engine.normalizeWithTrace(
        program,
        rules,
        maxSteps,
        false,
        foldPrims
      );
      universe = engine.setProgram(universe, result);

      if (traceSteps.length > 0) {
        platform.print('\nExecution trace:');
        for (const step of traceSteps) {
          platform.print(`  [${step.i}] Rule "${step.rule}" at path [${step.path.join(',')}]`);
        }
      }
    } else {
      const normalized = engine.normalize(program, rules, maxSteps, false, foldPrims);
      universe = engine.setProgram(universe, normalized);
    }

    // Wait for effects to complete
    let waitCount = 0;
    const maxWait = 6000; // 60 seconds max
    let consecutiveEmptyChecks = 0;
    const requiredEmptyChecks = 5; // Need 5 consecutive empty checks (50ms total)

    while (waitCount < maxWait) {
      await new Promise(resolve => setTimeout(resolve, 10));

      const program = engine.getProgram(universe);
      const effects = program.a.find(n => isCall(n) && isSym(n.h) && n.h.v === 'Effects');

      let hasPending = false;
      if (effects) {
        const pending = effects.a[0];
        if (isCall(pending) && pending.a.length > 0) {
          hasPending = true;
        }
      }

      const hasActiveIO = effectsProcessor && effectsProcessor.hasActiveIO && effectsProcessor.hasActiveIO();
      const hasActiveTimers = effectsProcessor && effectsProcessor.hasActiveTimers && effectsProcessor.hasActiveTimers();

      if (!hasPending && !hasActiveIO && !hasActiveTimers) {
        consecutiveEmptyChecks++;
        if (consecutiveEmptyChecks >= requiredEmptyChecks) {
          break;
        }
      } else {
        consecutiveEmptyChecks = 0;
      }

      waitCount++;
    }

    // Clean up
    if (effectsProcessor && effectsProcessor.cleanup) {
      effectsProcessor.cleanup();
    }

    // Exit successfully
    process.exit(0);
  } catch (error) {
    console.error(`\nError running program: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

/**
 * Compile a .syma file to universe AST
 */
async function compileSymaFile(filePath, platform) {
  if (!(await fs.stat(filePath).catch(() => null))) {
    throw new Error(`File not found: ${filePath}`);
  }

  const parser = await createParser({ useTreeSitter: true });
  const content = await fs.readFile(filePath, 'utf-8');
  const ast = parser.parseString(content, filePath);

  // Check if it's a module
  if (isCall(ast) && isSym(ast.h) && ast.h.v === 'Module') {
    const nameNode = ast.a[0];
    if (!isSym(nameNode)) {
      throw new Error('Module name must be a symbol');
    }
    const moduleName = nameNode.v;

    // Use the compiler to bundle
    return new Promise((resolve, reject) => {
      const compilerPath = path.join(path.dirname(new URL(import.meta.url).pathname), '../../bin/syma-compile.js');
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
    // It's a plain expression/universe
    return ast;
  }
}
