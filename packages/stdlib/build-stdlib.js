#!/usr/bin/env node

/**
 * Pre-compiles stdlib modules for browser use
 * Each module is compiled individually with --library flag
 * and stored as a separate JSON file that can be fetched on demand
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const stdlibDir = path.join(__dirname, 'syma');
const outputDir = path.join(__dirname, 'dist');

// Module name mapping (file name -> module name)
const moduleNameMap = {
    'core-main.syma': 'Core/Main',
    'core-string.syma': 'Core/String',
    'core-list.syma': 'Core/List',
    'core-fun.syma': 'Core/Fun',
    'core-fun-withsugar.syma': 'Core/Fun/WithSugar',
    'core-kv.syma': 'Core/KV',
    'core-plumb.syma': 'Core/Plumb',
    'core-zipper.syma': 'Core/Zipper',
    'core-set.syma': 'Core/Set',
    'core-effect.syma': 'Core/Effect',
    'core-syntax-global.syma': 'Core/Syntax/Global',
    'algebra-simplify.syma': 'Algebra/Simplify',
    'notebook-ui.syma': 'Notebook/UI',
    'core-rope.syma': 'Core/Rope',
    'core-json.syma': 'Core/Json',
    'core-tojson.syma': 'Core/ToJson',
    'core-fromjson-lex.syma': 'Core/FromJson/Lex',
    'core-fromjson-annotate.syma': 'Core/FromJson/Annotate',
    'core-fromjson.syma': 'Core/FromJson',
    'core-lift.syma': 'Core/Lift',
};

console.log('Building stdlib modules for browser...');

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

// Get all .syma files in stdlib
const symaFiles = fs.readdirSync(stdlibDir)
    .filter(f => f.endsWith('.syma'));

console.log(`Found ${symaFiles.length} stdlib modules`);

// Create the module index
const moduleIndex = {};

for (const file of symaFiles) {
    const moduleName = moduleNameMap[file];
    if (!moduleName) {
        console.warn(`  Warning: No module name mapping for ${file}, skipping`);
        continue;
    }

    console.log(`  Compiling ${moduleName}...`);

    try {
        const inputPath = path.join(stdlibDir, file);
        const outputFile = `${moduleName.toLowerCase().replace(/\//g, '-')}.json`;
        const outputPath = path.join(outputDir, outputFile);

        // Run compiler in library mode (no Program section required)
        const compilerPath = path.join(__dirname, '../cli/bin/syma-compile.js');
        const command = `node ${compilerPath} ${inputPath} --library`;
        const result = execSync(command, { encoding: 'utf8' });

        // Write the compiled module
        fs.writeFileSync(outputPath, result);

        // Add to index
        moduleIndex[moduleName] = `/stdlib/${outputFile}`;

        console.log(`    ✓ Saved to ${outputFile}`);

    } catch (error) {
        console.error(`    ✗ Error compiling ${moduleName}:`, error.message);
    }
}

// Write the module index
const indexPath = path.join(outputDir, 'index.json');
fs.writeFileSync(indexPath, JSON.stringify(moduleIndex, null, 2));

console.log(`\n✓ Module index written to ${indexPath}`);
console.log(`✓ Total modules compiled: ${Object.keys(moduleIndex).length}`);