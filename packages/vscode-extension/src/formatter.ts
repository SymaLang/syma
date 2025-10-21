/**
 * Syma Code Formatter for VS Code Extension
 * Uses syma-compile --format to format code
 */

import { spawn, exec } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

export interface FormatterOptions {
    indentSize?: number;
    maxInlineLength?: number;
    maxInlineArgs?: number;
    bracketStyle?: 'auto' | 'brace' | 'function';
}

export class SymaFormatter {
    private options: FormatterOptions;

    constructor(options: FormatterOptions = {}) {
        this.options = {
            indentSize: 2,
            maxInlineLength: 60,
            maxInlineArgs: 3,
            bracketStyle: 'auto',
            ...options
        };
    }

    /**
     * Format a Syma file in place using syma-compile --format
     */
    async formatFile(filePath: string): Promise<boolean> {
        return new Promise((resolve) => {
            // Build the command: symc "file.syma" -f -o "file.syma"
            const cmd = `symc "${filePath}" -f -o "${filePath}"`;
            console.log('Running format command:', cmd);

            exec(cmd, (error, stdout, stderr) => {
                if (error) {
                    console.error('Format command failed:', error);
                    console.error('Stderr:', stderr);

                    // Try alternative command syma-compile
                    const altCmd = `syma-compile "${filePath}" -f -o "${filePath}"`;
                    console.log('Trying alternative command:', altCmd);

                    exec(altCmd, (error2, stdout2, stderr2) => {
                        if (error2) {
                            console.error('Alternative command also failed:', error2);
                            console.error('Stderr:', stderr2);
                            resolve(false);
                        } else {
                            console.log('Format succeeded with syma-compile');
                            resolve(true);
                        }
                    });
                } else {
                    console.log('Format succeeded with symc');
                    resolve(true);
                }
            });
        });
    }

    /**
     * Format Syma code string using syma-compile --format
     */
    async format(code: string): Promise<string> {
        return new Promise((resolve) => {
            // Create a temporary file
            const tmpDir = os.tmpdir();
            const tmpFile = path.join(tmpDir, `syma_format_${Date.now()}.syma`);

            console.log('Formatting with temp file:', tmpFile);

            try {
                // Write code to temporary file
                fs.writeFileSync(tmpFile, code, 'utf8');

                // Try both symc and syma-compile commands
                const commands = ['symc', 'syma-compile'];
                let commandToUse = commands[0];

                // Build the command string for shell execution
                const cmd = `${commandToUse} "${tmpFile}" -f`;
                console.log('Running command:', cmd);

                // Use exec instead of spawn for better shell integration
                exec(cmd, (error, stdout, stderr) => {
                    // Clean up temp file
                    try {
                        fs.unlinkSync(tmpFile);
                    } catch (e) {
                        console.error('Failed to clean up temp file:', e);
                    }

                    if (error) {
                        console.error('Exec error:', error);
                        console.error('Stderr:', stderr);
                        // Try with syma-compile if symc failed
                        if (commandToUse === 'symc') {
                            const altCmd = `syma-compile "${tmpFile}" -f`;
                            console.log('Trying alternative command:', altCmd);
                            exec(altCmd, (error2, stdout2, stderr2) => {
                                if (!error2 && stdout2) {
                                    console.log('Alternative command succeeded');
                                    resolve(stdout2);
                                } else {
                                    console.log('Both commands failed, using simple formatter');
                                    resolve(this.simpleFormat(code));
                                }
                            });
                        } else {
                            console.log('Command failed, using simple formatter');
                            resolve(this.simpleFormat(code));
                        }
                    } else if (stdout) {
                        console.log('Formatting succeeded, output length:', stdout.length);
                        resolve(stdout);
                    } else {
                        console.log('No output from formatter, using simple formatter');
                        resolve(this.simpleFormat(code));
                    }
                });
            } catch (error) {
                console.error('Error in formatter:', error);
                // Fall back to simple formatting
                resolve(this.simpleFormat(code));
            }
        });
    }

    /**
     * Simple formatting without parsing - just fixes indentation
     */
    private simpleFormat(code: string): string {
        const lines = code.split('\n');
        const formatted: string[] = [];
        let indentLevel = 0;
        const indentStr = ' '.repeat(this.options.indentSize!);

        for (const line of lines) {
            const trimmed = line.trim();

            // Skip empty lines and comments
            if (trimmed === '' || trimmed.startsWith(';') || trimmed.startsWith('//')) {
                formatted.push(line);
                continue;
            }

            // Count brackets
            let openCount = 0;
            let closeCount = 0;
            let inString = false;
            let inComment = false;

            for (let i = 0; i < trimmed.length; i++) {
                const char = trimmed[i];
                const nextChar = i + 1 < trimmed.length ? trimmed[i + 1] : '';

                // Check for comments
                if (!inString && char === ';') {
                    inComment = true;
                    break;
                }
                if (!inString && char === '/' && nextChar === '/') {
                    inComment = true;
                    break;
                }
                if (!inString && char === '/' && nextChar === '*') {
                    inComment = true;
                    i++; // Skip the *
                    continue;
                }

                // Check for strings
                if (char === '"' && (i === 0 || trimmed[i - 1] !== '\\')) {
                    inString = !inString;
                    continue;
                }

                // Count brackets only outside strings and comments
                if (!inString && !inComment) {
                    if (char === '{' || char === '(') {
                        openCount++;
                    } else if (char === '}' || char === ')') {
                        closeCount++;
                    }
                }
            }

            // Adjust indent for closing brackets
            if (closeCount > openCount) {
                indentLevel = Math.max(0, indentLevel - (closeCount - openCount));
            }

            // Format the line
            if (trimmed.length > 0) {
                formatted.push(indentStr.repeat(indentLevel) + trimmed);
            } else {
                formatted.push('');
            }

            // Adjust indent for next line
            if (openCount > closeCount) {
                indentLevel += (openCount - closeCount);
            }
        }

        return formatted.join('\n');
    }
}