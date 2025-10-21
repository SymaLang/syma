/*****************************************************************
 * Browser Platform Adapter
 *
 * Implements the Platform interface for browser environments
 ******************************************************************/

import { Platform } from '@syma/core/platform';

export class BrowserPlatform extends Platform {
    constructor(options = {}) {
        super();
        this.webSockets = new Map();
        this.consoleElement = options.consoleElement; // Optional DOM element for output
    }

    // File I/O (limited in browser)
    async readFile(path) {
        // In browser, files can only be read via fetch or file input
        // This could fetch from the server
        try {
            const response = await fetch(path);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return await response.text();
        } catch (error) {
            throw new Error(`Failed to read file ${path}: ${error.message}`);
        }
    }

    async writeFile(path, content) {
        // Browser cannot write to filesystem directly
        // This could trigger a download instead
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = path.split('/').pop();
        a.click();
        URL.revokeObjectURL(url);
    }

    async fileExists(path) {
        try {
            const response = await fetch(path, { method: 'HEAD' });
            return response.ok;
        } catch {
            return false;
        }
    }

    // Console I/O
    print(message) {
        console.log(message);

        // Also append to console element if provided
        if (this.consoleElement) {
            const line = document.createElement('div');
            line.textContent = message;
            line.className = 'console-line';
            this.consoleElement.appendChild(line);
            this.consoleElement.scrollTop = this.consoleElement.scrollHeight;
        }
    }

    async readLine() {
        // Browser doesn't have blocking input like Node.js
        // Using prompt without a message for raw input
        return new Promise(resolve => {
            const input = window.prompt('');
            resolve(input || '');
        });
    }

    async getChar() {
        // Browser doesn't have single character input
        // Using prompt and taking first character
        return new Promise(resolve => {
            const input = window.prompt('');
            resolve(input ? input[0] : '');
        });
    }

    clearScreen() {
        console.clear();

        if (this.consoleElement) {
            this.consoleElement.innerHTML = '';
        }
    }

    // Storage (using localStorage)
    async getStorage(key) {
        const value = localStorage.getItem(key);
        if (value !== null) {
            try {
                return JSON.parse(value);
            } catch {
                return value;
            }
        }
        return undefined;
    }

    async setStorage(key, value) {
        const serialized = typeof value === 'string' ? value : JSON.stringify(value);
        localStorage.setItem(key, serialized);
    }

    async deleteStorage(key) {
        const existed = localStorage.getItem(key) !== null;
        localStorage.removeItem(key);
        return existed;
    }

    // Network
    async httpRequest(url, options = {}) {
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
        const ws = new WebSocket(url);
        const id = `ws-${Date.now()}-${Math.random()}`;
        this.webSockets.set(id, ws);

        // Wrap in a common interface
        return {
            id,
            send: (data) => ws.send(data),
            close: (code = 1000, reason = '') => ws.close(code, reason),
            onOpen: (handler) => ws.addEventListener('open', handler),
            onMessage: (handler) => ws.addEventListener('message', handler),
            onError: (handler) => ws.addEventListener('error', handler),
            onClose: (handler) => ws.addEventListener('close', handler),
            readyState: () => ws.readyState
        };
    }

    // Timers
    setTimeout(fn, delay) {
        return window.setTimeout(fn, delay);
    }

    clearTimeout(id) {
        window.clearTimeout(id);
    }

    setInterval(fn, delay) {
        return window.setInterval(fn, delay);
    }

    clearInterval(id) {
        window.clearInterval(id);
    }

    requestAnimationFrame(fn) {
        return window.requestAnimationFrame(fn);
    }

    // Navigation
    navigateTo(url, replace = false) {
        if (replace) {
            window.history.replaceState(null, '', url);
        } else {
            window.history.pushState(null, '', url);
        }
    }

    getCurrentLocation() {
        return {
            path: window.location.pathname,
            query: window.location.search,
            hash: window.location.hash
        };
    }

    // Clipboard
    async clipboardRead() {
        try {
            return await navigator.clipboard.readText();
        } catch (error) {
            throw new Error(`Clipboard read failed: ${error.message}`);
        }
    }

    async clipboardWrite(text) {
        try {
            await navigator.clipboard.writeText(text);
        } catch (error) {
            throw new Error(`Clipboard write failed: ${error.message}`);
        }
    }

    // Process/Environment
    exit(code = 0) {
        // Browser can't exit, but we can close the window/tab
        if (code !== 0) {
            console.error(`Exit with code ${code}`);
        }
        window.close(); // May not work depending on how window was opened
    }

    getEnv(key) {
        // Browser doesn't have environment variables
        // Could use meta tags or global config instead
        return window.SYMA_ENV?.[key];
    }

    // Execution (not available in browser)
    async exec(command) {
        throw new Error("Command execution not available in browser environment");
    }

    // Platform identification
    getPlatformName() {
        return `Browser (${navigator.userAgent})`;
    }

    isBrowser() {
        return true;
    }

    // Cleanup
    cleanup() {
        // Close all WebSockets
        for (const ws of this.webSockets.values()) {
            if (ws.readyState === WebSocket.OPEN) {
                ws.close();
            }
        }
        this.webSockets.clear();
    }
}