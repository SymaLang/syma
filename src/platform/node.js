/*****************************************************************
 * Node.js Platform Adapter
 *
 * Implements the Platform interface for Node.js environments
 ******************************************************************/

import { Platform } from './index.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as readline from 'readline';
import { exec as execCb } from 'child_process';
import { promisify } from 'util';
import { createRequire } from 'module';

const execAsync = promisify(execCb);
const require = createRequire(import.meta.url);

// Try to import optional dependencies
let fetch;
try {
    fetch = (await import('node-fetch')).default;
} catch {
    // node-fetch not available, will use native fetch if available (Node 18+)
    fetch = globalThis.fetch;
}

let WebSocket;
try {
    WebSocket = (await import('ws')).default;
} catch {
    // ws not available
}

export class NodePlatform extends Platform {
    constructor(options = {}) {
        super();
        this.rl = null; // Will be created on demand
        this.replMode = false; // Track if we're in REPL mode
        this.storage = new Map(); // In-memory storage for REPL
        this.storagePath = options.storagePath || '.syma-storage.json';
        this.historyPath = options.historyPath || '.syma-history';
        this.webSockets = new Map();
        this.timers = new Map();
        this.intervals = new Map();
        this.nextTimerId = 1;
    }

    // Set REPL mode
    setReplMode(enabled) {
        this.replMode = enabled;
        if (enabled) {
            // Create readline interface immediately for REPL mode
            if (!this.rl) {
                this.rl = readline.createInterface({
                    input: process.stdin,
                    output: process.stdout,
                    terminal: true,
                    historySize: 1000
                });
            }
        } else if (this.rl) {
            this.rl.close();
            this.rl = null;
        }
    }

    // Add command to readline history
    addToReplHistory(command) {
        if (this.rl && this.rl.history && command) {
            // Don't add duplicates of the immediate previous command
            if (this.rl.history.length === 0 || this.rl.history[0] !== command) {
                this.rl.history.unshift(command);
            }
        }
    }

    // File I/O
    async readFile(filePath) {
        try {
            return await fs.readFile(filePath, 'utf-8');
        } catch (error) {
            throw new Error(`Failed to read file ${filePath}: ${error.message}`);
        }
    }

    async writeFile(filePath, content) {
        try {
            await fs.writeFile(filePath, content, 'utf-8');
        } catch (error) {
            throw new Error(`Failed to write file ${filePath}: ${error.message}`);
        }
    }

    async fileExists(filePath) {
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    // Console I/O
    print(message) {
        process.stdout.write(message);
    }

    async readLine(internalPrompt = '') {
        // In REPL mode, keep the interface alive for history
        if (this.replMode) {
            // Create interface if it doesn't exist
            if (!this.rl) {
                this.rl = readline.createInterface({
                    input: process.stdin,
                    output: process.stdout,
                    terminal: true,
                    historySize: 1000
                });
            }

            return new Promise(resolve => {
                this.rl.question(internalPrompt, answer => {
                    resolve(answer);
                });
            });
        } else {
            // Non-REPL mode: create and destroy interface each time
            // Close existing readline interface if any (for getChar compatibility)
            if (this.rl) {
                this.rl.close();
                this.rl = null;
            }

            // Create new readline interface
            this.rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout,
                terminal: true
            });

            return new Promise(resolve => {
                this.rl.question(internalPrompt, answer => {
                    // Close after getting answer to allow getChar to work
                    this.rl.close();
                    this.rl = null;
                    resolve(answer);
                });
            });
        }
    }

    async getChar() {
        // Close readline interface if active (interferes with raw mode)
        if (this.rl) {
            this.rl.close();
            this.rl = null;
        }

        // Only set raw mode if we're in TTY mode
        const isTTY = process.stdin.isTTY;
        if (isTTY) {
            const wasRaw = process.stdin.isRaw || false;
            process.stdin.setRawMode(true);
            process.stdin.resume();

            return new Promise(resolve => {
                const onData = (chunk) => {
                    // Restore previous mode
                    process.stdin.setRawMode(wasRaw);
                    process.stdin.pause();
                    process.stdin.removeListener('data', onData);

                    // Return the first character
                    const char = chunk.toString()[0];

                    // Echo the character and newline (for visual feedback)
                    process.stdout.write(char + '\n');

                    resolve(char);
                };

                process.stdin.once('data', onData);
            });
        } else {
            // Non-TTY mode (piped input) - just read a line and take first char
            return new Promise(resolve => {
                const rl = readline.createInterface({
                    input: process.stdin,
                    output: process.stdout
                });
                rl.once('line', (line) => {
                    rl.close();
                    const char = line[0] || '';
                    resolve(char);
                });
            });
        }
    }

    clearScreen() {
        // Clear screen escape sequence
        process.stdout.write('\x1b[2J\x1b[0f');
    }

    // Storage (persistent key-value using JSON file)
    async loadStorage() {
        if (await this.fileExists(this.storagePath)) {
            try {
                const data = await this.readFile(this.storagePath);
                const parsed = JSON.parse(data);
                this.storage = new Map(Object.entries(parsed));
            } catch (error) {
                console.warn(`Failed to load storage: ${error.message}`);
            }
        }
    }

    async saveStorage() {
        const obj = Object.fromEntries(this.storage);
        await this.writeFile(this.storagePath, JSON.stringify(obj, null, 2));
    }

    async getStorage(key) {
        await this.loadStorage();
        return this.storage.get(key);
    }

    async setStorage(key, value) {
        await this.loadStorage();
        this.storage.set(key, value);
        await this.saveStorage();
    }

    async deleteStorage(key) {
        await this.loadStorage();
        const result = this.storage.delete(key);
        if (result) {
            await this.saveStorage();
        }
        return result;
    }

    // Network
    async httpRequest(url, options = {}) {
        if (!fetch) {
            throw new Error("HTTP requests not available. Install node-fetch or use Node.js 18+");
        }

        try {
            const response = await fetch(url, {
                method: options.method || 'GET',
                headers: options.headers || {},
                body: options.body ? JSON.stringify(options.body) : undefined
            });

            const text = await response.text();
            let data;
            try {
                data = JSON.parse(text);
            } catch {
                data = text;
            }

            return {
                status: response.status,
                statusText: response.statusText,
                headers: Object.fromEntries(response.headers.entries()),
                data
            };
        } catch (error) {
            throw new Error(`HTTP request failed: ${error.message}`);
        }
    }

    // WebSocket
    createWebSocket(url) {
        if (!WebSocket) {
            throw new Error("WebSocket not available. Install 'ws' package");
        }

        const ws = new WebSocket(url);
        const id = `ws-${Date.now()}-${Math.random()}`;
        this.webSockets.set(id, ws);

        // Wrap in a common interface
        return {
            id,
            send: (data) => ws.send(data),
            close: (code = 1000, reason = '') => ws.close(code, reason),
            onOpen: (handler) => ws.on('open', handler),
            onMessage: (handler) => ws.on('message', (data) => handler({ data: data.toString() })),
            onError: (handler) => ws.on('error', handler),
            onClose: (handler) => ws.on('close', (code, reason) => handler({ code, reason: reason.toString() })),
            readyState: () => ws.readyState
        };
    }

    // Timers
    setTimeout(fn, delay) {
        const id = this.nextTimerId++;
        const timer = global.setTimeout(() => {
            this.timers.delete(id);
            fn();
        }, delay);
        this.timers.set(id, timer);
        return id;
    }

    clearTimeout(id) {
        const timer = this.timers.get(id);
        if (timer) {
            global.clearTimeout(timer);
            this.timers.delete(id);
        }
    }

    setInterval(fn, delay) {
        const id = this.nextTimerId++;
        const interval = global.setInterval(fn, delay);
        this.intervals.set(id, interval);
        return id;
    }

    clearInterval(id) {
        const interval = this.intervals.get(id);
        if (interval) {
            global.clearInterval(interval);
            this.intervals.delete(id);
        }
    }

    requestAnimationFrame(fn) {
        // Simulate with 16ms timeout (60fps)
        return this.setTimeout(fn, 16);
    }

    // Navigation (not applicable in Node.js)
    navigateTo(url, replace = false) {
        this.print(`[Navigation] Would navigate to: ${url} (replace: ${replace})`);
        // In a REPL context, this is a no-op
    }

    getCurrentLocation() {
        // Return current working directory as a pseudo-location
        return {
            path: process.cwd(),
            query: '',
            hash: ''
        };
    }

    // Clipboard (limited support via terminal)
    async clipboardRead() {
        // Could use 'clipboardy' package or system commands
        throw new Error("Clipboard read not implemented. Install 'clipboardy' for clipboard support");
    }

    async clipboardWrite(text) {
        // Could use 'clipboardy' package or system commands
        throw new Error("Clipboard write not implemented. Install 'clipboardy' for clipboard support");
    }

    // Process/Environment
    exit(code = 0) {
        if (this.rl) {
            this.rl.close();
        }
        process.exit(code);
    }

    getEnv(key) {
        return process.env[key];
    }

    // Execution
    async exec(command) {
        try {
            const { stdout, stderr } = await execAsync(command);
            return {
                stdout,
                stderr,
                exitCode: 0
            };
        } catch (error) {
            return {
                stdout: error.stdout || '',
                stderr: error.stderr || error.message,
                exitCode: error.code || 1
            };
        }
    }

    // Platform identification
    getPlatformName() {
        return `Node.js ${process.version} on ${process.platform}`;
    }

    isREPL() {
        return true; // This adapter is primarily for REPL use
    }

    isNode() {
        return true;
    }

    // Cleanup
    cleanup() {
        if (this.rl) {
            this.rl.close();
            this.rl = null;
        }

        // Clear all timers
        for (const timer of this.timers.values()) {
            global.clearTimeout(timer);
        }
        this.timers.clear();

        for (const interval of this.intervals.values()) {
            global.clearInterval(interval);
        }
        this.intervals.clear();

        // Close all WebSockets
        for (const ws of this.webSockets.values()) {
            if (ws.readyState === 1) { // OPEN
                ws.close();
            }
        }
        this.webSockets.clear();
    }
}