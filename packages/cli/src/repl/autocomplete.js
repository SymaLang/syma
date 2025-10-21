/*****************************************************************
 * REPL Autocomplete Module
 *
 * Provides tab completion for commands and file paths
 ******************************************************************/

import * as fs from 'fs';
import * as path from 'path';

// Try to import glob, but don't fail if it's not available
let glob;
try {
    glob = (await import('glob')).glob;
} catch {
    // glob not available, file completion will be limited
    glob = null;
}

export class Autocompleter {
    constructor(commandProcessor) {
        this.commandProcessor = commandProcessor;

        // Cache available commands
        this.commands = this.getAllCommands();
    }

    getAllCommands() {
        // Get all commands from the command processor
        const commands = Object.keys(this.commandProcessor.commands);
        // Add colon prefix to all commands
        return commands.map(cmd => ':' + cmd);
    }

    async complete(line) {
        const completions = await this.getCompletions(line);
        return [completions, line];
    }

    async getCompletions(line) {
        const trimmed = line.trim();

        // Command completion
        if (trimmed.startsWith(':')) {
            // Check if this is a command that takes file arguments
            const fileCommands = [':load', ':save', ':bundle', ':import', ':export'];
            const spaceIndex = trimmed.indexOf(' ');

            if (spaceIndex > 0) {
                // We have a command with arguments
                const command = trimmed.substring(0, spaceIndex);
                const argPart = trimmed.substring(spaceIndex + 1);

                if (fileCommands.includes(command)) {
                    // File path completion
                    return await this.getFileCompletions(argPart, line.substring(0, spaceIndex + 1));
                }

                // No completion for other command arguments
                return [];
            } else {
                // Command name completion
                return this.getCommandCompletions(trimmed);
            }
        }

        // Expression completion (symbols from current universe)
        return this.getSymbolCompletions(trimmed);
    }

    getCommandCompletions(partial) {
        // Filter commands that start with the partial input
        const matches = this.commands.filter(cmd => cmd.startsWith(partial));

        // If no matches, return empty
        if (matches.length === 0) return [];

        // If we have an exact match and it's the only match, return empty
        if (matches.length === 1 && matches[0] === partial) return [];

        // Sort matches and add a space after each command for convenience
        // This allows the user to immediately start typing arguments
        return matches.sort().map(cmd => cmd + ' ');
    }

    async getFileCompletions(partial, commandPrefix) {
        try {
            // Handle relative and absolute paths
            let searchDir = '.';
            let filePrefix = partial;

            // Check if there's a directory component
            const lastSlash = partial.lastIndexOf('/');
            if (lastSlash >= 0) {
                searchDir = partial.substring(0, lastSlash + 1) || '.';
                filePrefix = partial.substring(lastSlash + 1);
            }

            // Resolve the search directory
            const resolvedDir = path.resolve(searchDir);

            // Check if directory exists
            if (!fs.existsSync(resolvedDir)) {
                return [];
            }

            // Get all entries in the directory
            const entries = await fs.promises.readdir(resolvedDir, { withFileTypes: true });

            // Filter entries that start with the prefix
            const matches = entries
                .filter(entry => entry.name.startsWith(filePrefix))
                .map(entry => {
                    const fullPath = path.join(searchDir, entry.name);
                    // Add trailing slash for directories
                    return entry.isDirectory() ? fullPath + '/' : fullPath;
                });

            // Special handling for .syma files - also search common locations
            if (glob && (partial.length === 0 || !partial.includes('/'))) {
                // Also look in common directories for .syma files
                const commonDirs = ['packages/demos/syma', 'src/modules', 'packages/stdlib/syma', 'src/demos', 'src/stdlib'];
                for (const dir of commonDirs) {
                    if (fs.existsSync(dir)) {
                        try {
                            const symaFiles = await glob(`${dir}/*.syma`);
                            matches.push(...symaFiles);
                        } catch (e) {
                            // Ignore glob errors
                        }
                    }
                }
            }

            // Return unique completions with the command prefix
            const uniqueMatches = [...new Set(matches)];
            return uniqueMatches.map(match => commandPrefix + match);
        } catch (error) {
            // On error, return no completions
            return [];
        }
    }

    getSymbolCompletions(partial) {
        // For now, return empty array
        // In the future, we could extract symbols from the current universe
        // and provide completion for them
        return [];
    }

    // Create a completer function for readline
    createCompleter() {
        return async (line, callback) => {
            try {
                const [completions, originalLine] = await this.complete(line);

                if (Array.isArray(completions) && completions.length > 0) {
                    // Return completions for readline
                    callback(null, [completions, originalLine]);
                } else {
                    // No completions
                    callback(null, [[], line]);
                }
            } catch (error) {
                // On error, return no completions
                callback(null, [[], line]);
            }
        };
    }
}