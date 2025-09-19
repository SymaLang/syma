#!/usr/bin/env node

import { SymaParser } from './src/core/parser.js';
import { createTreeSitterParser } from './src/core/tree-sitter-parser.js';

async function testParsers() {
    const originalParser = new SymaParser();

    let treeSitterParser;
    try {
        treeSitterParser = await createTreeSitterParser();
    } catch (e) {
        console.error('Failed to initialize tree-sitter parser:', e.message);
        console.log('\nTo build the tree-sitter parser, run:');
        console.log('  cd tree-sitter-syma && npm run build && npm run build-wasm\n');
        process.exit(1);
    }

    console.log('Testing Tree-Sitter Parser vs Original Parser\n');
    console.log('=' .repeat(60));

    const testCases = [
        // Basic literals
        '42',
        '-3.14',
        '"hello world"',
        '"escaped\\"string\\nwith\\nnewlines"',
        'Symbol',

        // Comments - NEW FEATURES!
        '42 // single line comment',
        '42 ; semicolon comment',
        '/* multiline\ncomment */ 123',
        '{Add 1 /* inline */ 2}',

        // Variable patterns
        'x_',
        '_',
        'xs...',
        'xs___',
        '...',
        '___',

        // Brace syntax
        '{Add}',
        '{Add 1 2}',
        '{If true {Print "yes"} {Print "no"}}',

        // Function call syntax
        'Add()',
        'Add(1, 2)',
        'If(true, Print("yes"), Print("no"))',

        // Mixed syntax
        '{Map Add(1) xs_}',
        'Apply(Inc, {State 0})',

        // Multiple top-level expressions
        '1 2 3',
        '{Add 1 2} {Mul 3 4}',

        // Complex nested structures
        `{Module Test
            {Export foo bar}
            {Import Other/Module as OM}
            {Defs
                {Def foo 42}
                {Def bar {Add foo 1}}}
            {Program {Print bar}}
            {Rules
                {R "test" {Add x_ 0} x_}}}`,
    ];

    let passed = 0;
    let failed = 0;

    for (const testCase of testCases) {
        try {
            const original = originalParser.parseString(testCase);
            const treeSitter = treeSitterParser.parseString(testCase);

            const originalJSON = JSON.stringify(original, null, 2);
            const treeSitterJSON = JSON.stringify(treeSitter, null, 2);

            if (originalJSON === treeSitterJSON) {
                console.log(`✓ PASS: ${testCase.substring(0, 50)}${testCase.length > 50 ? '...' : ''}`);
                passed++;
            } else {
                console.log(`✗ FAIL: ${testCase.substring(0, 50)}${testCase.length > 50 ? '...' : ''}`);
                console.log('  Original AST:', originalJSON.substring(0, 100));
                console.log('  Tree-Sitter AST:', treeSitterJSON.substring(0, 100));
                failed++;
            }
        } catch (error) {
            console.log(`✗ ERROR: ${testCase.substring(0, 50)}${testCase.length > 50 ? '...' : ''}`);
            console.log(`  ${error.message}`);
            failed++;
        }
    }

    console.log('\n' + '=' .repeat(60));
    console.log(`Results: ${passed} passed, ${failed} failed`);

    // Test error cases
    console.log('\nTesting Error Handling:\n');

    const errorCases = [
        '/* unterminated comment',
        '"unterminated string',
        '{unclosed brace',
        'func(unclosed paren',
        '}unexpected close',
        '{} // empty braces should error',
    ];

    for (const errorCase of errorCases) {
        let originalError = null;
        let treeSitterError = null;

        try {
            originalParser.parseString(errorCase);
        } catch (e) {
            originalError = e.message;
        }

        try {
            treeSitterParser.parseString(errorCase);
        } catch (e) {
            treeSitterError = e.message;
        }

        if (originalError && treeSitterError) {
            console.log(`✓ Both parsers correctly rejected: ${errorCase}`);
            console.log(`  Original: ${originalError}`);
            console.log(`  Tree-Sitter: ${treeSitterError}`);
        } else {
            console.log(`✗ Error handling mismatch for: ${errorCase}`);
            if (!originalError) console.log('  Original parser did not error!');
            if (!treeSitterError) console.log('  Tree-sitter parser did not error!');
        }
    }
}

// Run tests
testParsers().catch(console.error);