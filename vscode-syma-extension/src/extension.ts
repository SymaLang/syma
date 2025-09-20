import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';
import { SymaFormatter } from './formatter';

let replTerminal: vscode.Terminal | undefined;

export function activate(context: vscode.ExtensionContext) {
    console.log('Syma Language extension is now active!');

    // Register compile command
    const compileCommand = vscode.commands.registerCommand('syma.compile', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active Syma file');
            return;
        }

        const document = editor.document;
        if (document.languageId !== 'syma') {
            vscode.window.showErrorMessage('Current file is not a Syma file');
            return;
        }

        // Save the file first
        document.save().then(() => {
            const filePath = document.fileName;
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
            const cwd = workspaceFolder ? workspaceFolder.uri.fsPath : path.dirname(filePath);

            // Determine output path
            const outputPath = path.join(
                path.dirname(filePath),
                path.basename(filePath, '.syma') + '.json'
            );

            // Run the compiler
            const compileProcess = spawn('syma-compile', [
                filePath,
                '--out', outputPath,
                '--pretty'
            ], {
                cwd: cwd,
                shell: true
            });

            let output = '';
            let errorOutput = '';

            compileProcess.stdout.on('data', (data) => {
                output += data.toString();
            });

            compileProcess.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });

            compileProcess.on('close', (code) => {
                if (code === 0) {
                    vscode.window.showInformationMessage(`Compiled successfully to ${path.basename(outputPath)}`);
                } else {
                    vscode.window.showErrorMessage(`Compilation failed: ${errorOutput || output}`);
                }
            });

            compileProcess.on('error', (err) => {
                vscode.window.showErrorMessage(`Failed to run compiler: ${err.message}. Make sure syma-compile is in your PATH.`);
            });
        });
    });

    // Register run command
    const runCommand = vscode.commands.registerCommand('syma.run', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active Syma file');
            return;
        }

        const document = editor.document;
        if (document.languageId !== 'syma') {
            vscode.window.showErrorMessage('Current file is not a Syma file');
            return;
        }

        // Save the file first
        document.save().then(() => {
            const filePath = document.fileName;
            const fileName = path.basename(filePath);

            // Create or reuse terminal
            const terminal = vscode.window.createTerminal(`Syma: ${fileName}`);
            terminal.show();
            terminal.sendText(`syma "${filePath}"`);
        });
    });

    // Register REPL command
    const replCommand = vscode.commands.registerCommand('syma.repl', () => {
        if (replTerminal) {
            replTerminal.show();
        } else {
            replTerminal = vscode.window.createTerminal('Syma REPL');
            replTerminal.show();
            replTerminal.sendText('syma');

            // Clean up when terminal is closed
            const terminalCloseListener = vscode.window.onDidCloseTerminal((closedTerminal) => {
                if (closedTerminal === replTerminal) {
                    replTerminal = undefined;
                }
            });
            context.subscriptions.push(terminalCloseListener);
        }
    });

    // Register hover provider for documentation
    const hoverProvider = vscode.languages.registerHoverProvider('syma', {
        provideHover(document, position, token) {
            const range = document.getWordRangeAtPosition(position);
            const word = document.getText(range);

            const documentation = getDocumentation(word);
            if (documentation) {
                return new vscode.Hover(documentation);
            }
        }
    });

    // Register completion provider
    const completionProvider = vscode.languages.registerCompletionItemProvider('syma', {
        provideCompletionItems(document, position, token, context) {
            const completions: vscode.CompletionItem[] = [];

            // Add keywords
            const keywords = [
                'Module', 'Export', 'Import', 'Defs', 'Program', 'Rules', 'RuleRules',
                'If', 'When', 'Apply', 'Project', 'R', 'Def', 'Var', 'VarRest',
                'True', 'False', 'Nil'
            ];

            for (const keyword of keywords) {
                const item = new vscode.CompletionItem(keyword, vscode.CompletionItemKind.Keyword);
                item.detail = `Syma keyword`;
                completions.push(item);
            }

            // Add built-in functions
            const builtins = [
                { name: 'Add', signature: 'Add(n1, n2)', doc: 'Add two numbers' },
                { name: 'Sub', signature: 'Sub(n1, n2)', doc: 'Subtract two numbers' },
                { name: 'Mul', signature: 'Mul(n1, n2)', doc: 'Multiply two numbers' },
                { name: 'Div', signature: 'Div(n1, n2)', doc: 'Divide two numbers' },
                { name: 'Eq', signature: 'Eq(a, b)', doc: 'Check equality' },
                { name: 'Concat', signature: 'Concat(s1, s2, ...)', doc: 'Concatenate strings' },
                { name: 'If', signature: 'If(condition, then, else)', doc: 'Conditional expression' },
                { name: 'When', signature: 'When(condition, action)', doc: 'Conditional action' },
                { name: 'FreshId', signature: 'FreshId()', doc: 'Generate unique identifier' }
            ];

            for (const builtin of builtins) {
                const item = new vscode.CompletionItem(builtin.name, vscode.CompletionItemKind.Function);
                item.detail = builtin.signature;
                item.documentation = new vscode.MarkdownString(builtin.doc);
                completions.push(item);
            }

            return completions;
        }
    });

    // Register formatting provider
    const formattingProvider = vscode.languages.registerDocumentFormattingEditProvider('syma', {
        async provideDocumentFormattingEdits(document, options, token) {
            const formatter = new SymaFormatter({
                indentSize: options.insertSpaces ? options.tabSize : 2,
                maxInlineLength: 120,
                maxInlineArgs: 6,
                bracketStyle: 'auto'
            });
            try {
                // Save the document first if it has unsaved changes
                if (document.isDirty) {
                    await document.save();
                }

                // Format the file in place
                const filePath = document.fileName;
                const formatted = await formatter.formatFile(filePath);

                if (formatted) {
                    // Reload the document to get the formatted content
                    const text = document.getText();
                    const newText = fs.readFileSync(filePath, 'utf8');

                    if (newText !== text) {
                        const fullRange = new vscode.Range(
                            document.positionAt(0),
                            document.positionAt(text.length)
                        );
                        return [vscode.TextEdit.replace(fullRange, newText)];
                    }
                }

                return [];
            } catch (error) {
                console.error('Formatting error:', error);
                const errorMessage = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Failed to format Syma code: ${errorMessage}`);
                return [];
            }
        }
    });

    // Register all providers and commands
    context.subscriptions.push(
        compileCommand,
        runCommand,
        replCommand,
        hoverProvider,
        completionProvider,
        formattingProvider
    );

    // Create output channel for diagnostics
    const diagnosticsCollection = vscode.languages.createDiagnosticCollection('syma');
    context.subscriptions.push(diagnosticsCollection);

    // Watch for file changes to update diagnostics
    const watcher = vscode.workspace.createFileSystemWatcher('**/*.syma');

    watcher.onDidChange((uri) => validateSymaDocument(uri, diagnosticsCollection));
    watcher.onDidCreate((uri) => validateSymaDocument(uri, diagnosticsCollection));
    watcher.onDidDelete((uri) => diagnosticsCollection.delete(uri));

    context.subscriptions.push(watcher);

    // Validate all open Syma documents
    vscode.workspace.textDocuments.forEach(doc => {
        if (doc.languageId === 'syma') {
            validateSymaDocument(doc.uri, diagnosticsCollection);
        }
    });
}

export function deactivate() {
    if (replTerminal) {
        replTerminal.dispose();
    }
}

function getDocumentation(word: string): vscode.MarkdownString | undefined {
    const docs: { [key: string]: string } = {
        'Module': '**Module** - Define a module with exports, imports, definitions, program, and rules',
        'Export': '**Export** - Specify symbols exported by this module',
        'Import': '**Import** - Import symbols from another module',
        'R': '**R** - Define a rewrite rule: `R(name, pattern, replacement, priority?)`',
        'Add': '**Add** - Add two or more numbers: `Add(n1, n2, ...)`',
        'If': '**If** - Conditional expression: `If(condition, thenBranch, elseBranch)`',
        'Apply': '**Apply** - Apply an action to state: `Apply(action, state)`',
        'Project': '**Project** - Project an expression in UI context',
        'Show': '**Show** - Display a value in UI',
        '/@': '**/@** - Projection operator: `{/@ expression context}`',
        'Var': '**Var** - Pattern variable for matching',
        'VarRest': '**VarRest** - Rest pattern variable for matching zero or more elements'
    };

    const doc = docs[word];
    if (doc) {
        return new vscode.MarkdownString(doc);
    }

    return undefined;
}

function validateSymaDocument(uri: vscode.Uri, diagnosticsCollection: vscode.DiagnosticCollection) {
    // Basic validation - check for matching brackets
    vscode.workspace.openTextDocument(uri).then(document => {
        const diagnostics: vscode.Diagnostic[] = [];
        const text = document.getText();

        // Check for unmatched brackets - only { } and ( ) are brackets in Syma
        const brackets: { [key: string]: string } = {
            '{': '}',
            '(': ')'
        };

        const stack: { char: string, line: number, col: number }[] = [];
        const lines = text.split('\n');
        let inBlockComment = false; // Track across lines

        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
            const line = lines[lineNum];
            let inString = false;

            for (let col = 0; col < line.length; col++) {
                const char = line[col];
                const nextChar = col + 1 < line.length ? line[col + 1] : '';
                const prevChar = col > 0 ? line[col - 1] : '';

                // Check for line comments
                if (!inString && !inBlockComment && char === ';') {
                    break; // Rest of line is a comment
                }
                if (!inString && !inBlockComment && char === '/' && nextChar === '/') {
                    break; // Rest of line is a comment
                }

                // Check for block comments
                if (!inString && char === '/' && nextChar === '*') {
                    inBlockComment = true;
                    col++; // Skip the *
                    continue;
                }
                if (inBlockComment && char === '*' && nextChar === '/') {
                    inBlockComment = false;
                    col++; // Skip the /
                    continue;
                }

                // Skip if in comment
                if (inBlockComment) {
                    continue;
                }

                // Check for strings
                if (char === '"' && prevChar !== '\\') {
                    inString = !inString;
                    continue;
                }

                // Skip if in string
                if (inString) {
                    continue;
                }

                // Now check for brackets
                if (char in brackets) {
                    stack.push({ char, line: lineNum, col });
                } else if (Object.values(brackets).includes(char)) {
                    if (stack.length === 0) {
                        const range = new vscode.Range(lineNum, col, lineNum, col + 1);
                        const diagnostic = new vscode.Diagnostic(
                            range,
                            `Unmatched closing bracket '${char}'`,
                            vscode.DiagnosticSeverity.Error
                        );
                        diagnostics.push(diagnostic);
                    } else {
                        const last = stack.pop()!;
                        const expected = brackets[last.char];
                        if (char !== expected) {
                            const range = new vscode.Range(lineNum, col, lineNum, col + 1);
                            const diagnostic = new vscode.Diagnostic(
                                range,
                                `Expected '${expected}' but found '${char}'`,
                                vscode.DiagnosticSeverity.Error
                            );
                            diagnostics.push(diagnostic);
                        }
                    }
                }
            }
        }

        // Check for unclosed brackets
        for (const unclosed of stack) {
            const range = new vscode.Range(unclosed.line, unclosed.col, unclosed.line, unclosed.col + 1);
            const diagnostic = new vscode.Diagnostic(
                range,
                `Unclosed bracket '${unclosed.char}'`,
                vscode.DiagnosticSeverity.Error
            );
            diagnostics.push(diagnostic);
        }

        diagnosticsCollection.set(uri, diagnostics);
    });
}