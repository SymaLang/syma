/*****************************************************************
 * Platform Abstraction Layer
 *
 * Defines the interface that must be implemented by all platform
 * adapters (Browser, Node.js, etc.)
 ******************************************************************/

/**
 * Abstract base class for platform implementations
 */
export class Platform {
    constructor() {
        if (new.target === Platform) {
            throw new Error("Platform is abstract and cannot be instantiated directly");
        }
    }

    // File I/O
    async readFile(path) {
        throw new Error("readFile() must be implemented by platform adapter");
    }

    async writeFile(path, content) {
        throw new Error("writeFile() must be implemented by platform adapter");
    }

    async fileExists(path) {
        throw new Error("fileExists() must be implemented by platform adapter");
    }

    // Console I/O
    print(message) {
        throw new Error("print() must be implemented by platform adapter");
    }

    async readLine(prompt = '') {
        throw new Error("readLine() must be implemented by platform adapter");
    }

    clearScreen() {
        throw new Error("clearScreen() must be implemented by platform adapter");
    }

    // Storage (key-value)
    async getStorage(key) {
        throw new Error("getStorage() must be implemented by platform adapter");
    }

    async setStorage(key, value) {
        throw new Error("setStorage() must be implemented by platform adapter");
    }

    async deleteStorage(key) {
        throw new Error("deleteStorage() must be implemented by platform adapter");
    }

    // Network
    async httpRequest(url, options = {}) {
        throw new Error("httpRequest() must be implemented by platform adapter");
    }

    // WebSocket
    createWebSocket(url) {
        throw new Error("createWebSocket() must be implemented by platform adapter");
    }

    // Timers
    setTimeout(fn, delay) {
        throw new Error("setTimeout() must be implemented by platform adapter");
    }

    clearTimeout(id) {
        throw new Error("clearTimeout() must be implemented by platform adapter");
    }

    setInterval(fn, delay) {
        throw new Error("setInterval() must be implemented by platform adapter");
    }

    clearInterval(id) {
        throw new Error("clearInterval() must be implemented by platform adapter");
    }

    requestAnimationFrame(fn) {
        throw new Error("requestAnimationFrame() must be implemented by platform adapter");
    }

    // Navigation
    navigateTo(url, replace = false) {
        throw new Error("navigateTo() must be implemented by platform adapter");
    }

    getCurrentLocation() {
        throw new Error("getCurrentLocation() must be implemented by platform adapter");
    }

    // Clipboard
    async clipboardRead() {
        throw new Error("clipboardRead() must be implemented by platform adapter");
    }

    async clipboardWrite(text) {
        throw new Error("clipboardWrite() must be implemented by platform adapter");
    }

    // Process/Environment
    exit(code = 0) {
        throw new Error("exit() must be implemented by platform adapter");
    }

    getEnv(key) {
        throw new Error("getEnv() must be implemented by platform adapter");
    }

    // Execution
    async exec(command) {
        throw new Error("exec() must be implemented by platform adapter");
    }

    // Platform identification
    getPlatformName() {
        throw new Error("getPlatformName() must be implemented by platform adapter");
    }

    isREPL() {
        return false; // Default: not in REPL mode
    }

    isBrowser() {
        return false; // Default: not in browser
    }

    isNode() {
        return false; // Default: not in Node.js
    }
}

// Global platform instance (will be set by the adapter)
let currentPlatform = null;

/**
 * Set the current platform adapter
 */
export function setPlatform(platform) {
    if (!(platform instanceof Platform)) {
        throw new Error("Platform must be an instance of Platform class");
    }
    currentPlatform = platform;
}

/**
 * Get the current platform adapter
 */
export function getPlatform() {
    if (!currentPlatform) {
        throw new Error("No platform adapter has been set. Call setPlatform() first.");
    }
    return currentPlatform;
}

/**
 * Check if a platform has been set
 */
export function hasPlatform() {
    return currentPlatform !== null;
}