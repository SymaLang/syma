/*****************************************************************
 * @syma/platform-browser - Browser platform adapter
 *
 * Exports browser-specific platform implementations and runtime
 ******************************************************************/

export { BrowserPlatform } from './browser.js';
export { boot } from './runtime.js';
export { clearInput, getInputValue } from './events.js';
export {
    isTraceEnabled,
    setTrace,
    formatStep,
    logDispatchTrace
} from './debug.js';
export { DebugOverlay } from './debug/index.js';
