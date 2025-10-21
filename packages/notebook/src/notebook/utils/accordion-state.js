/**
 * Utility functions for managing accordion state persistence
 */

const STORAGE_PREFIX = 'syma-accordion-';
const TIMESTAMP_SUFFIX = '-timestamp';
const CLEANUP_DAYS = 30;

/**
 * Clear all accordion states for a specific notebook
 * Called when loading a new notebook to prevent state conflicts
 */
export function clearNotebookAccordionStates(notebookId) {
    if (!notebookId) return;

    const prefix = `${STORAGE_PREFIX}accordion-`;
    const keys = Object.keys(localStorage);

    keys.forEach(key => {
        // Check if this key belongs to any cell in this notebook
        // Keys are in format: syma-accordion-accordion-{cellId}-{outputIndex}
        if (key.startsWith(STORAGE_PREFIX)) {
            // For now, clear all accordion states when switching notebooks
            // In the future, we could be more selective based on cellIds
            localStorage.removeItem(key);
        }
    });
}

/**
 * Clear accordion states for a specific cell
 * Called when a cell is deleted or re-executed
 */
export function clearCellAccordionStates(cellId) {
    if (!cellId) return;

    const prefix = `${STORAGE_PREFIX}accordion-${cellId}-`;
    const keys = Object.keys(localStorage);

    keys.forEach(key => {
        if (key.startsWith(prefix)) {
            localStorage.removeItem(key);
            localStorage.removeItem(`${key}${TIMESTAMP_SUFFIX}`);
        }
    });
}

/**
 * Clean up old accordion states
 * Removes states older than CLEANUP_DAYS
 */
export function cleanupOldAccordionStates() {
    const now = Date.now();
    const maxAge = CLEANUP_DAYS * 24 * 60 * 60 * 1000;
    const keys = Object.keys(localStorage);

    keys.forEach(key => {
        if (key.startsWith(STORAGE_PREFIX) && !key.endsWith(TIMESTAMP_SUFFIX)) {
            const timestampKey = `${key}${TIMESTAMP_SUFFIX}`;
            const timestamp = localStorage.getItem(timestampKey);

            if (timestamp) {
                const age = now - parseInt(timestamp, 10);
                if (age > maxAge) {
                    localStorage.removeItem(key);
                    localStorage.removeItem(timestampKey);
                }
            } else {
                // No timestamp found, this is an old entry, remove it
                localStorage.removeItem(key);
            }
        }
    });
}

/**
 * Migrate accordion states when duplicating a cell
 * Copies the accordion states from source cell to target cell
 */
export function duplicateCellAccordionStates(sourceCellId, targetCellId) {
    if (!sourceCellId || !targetCellId) return;

    const sourcePrefix = `${STORAGE_PREFIX}accordion-${sourceCellId}-`;
    const targetPrefix = `${STORAGE_PREFIX}accordion-${targetCellId}-`;
    const keys = Object.keys(localStorage);

    keys.forEach(key => {
        if (key.startsWith(sourcePrefix) && !key.endsWith(TIMESTAMP_SUFFIX)) {
            const outputIndex = key.substring(sourcePrefix.length);
            const targetKey = `${targetPrefix}${outputIndex}`;
            const state = localStorage.getItem(key);

            if (state) {
                localStorage.setItem(targetKey, state);
                localStorage.setItem(`${targetKey}${TIMESTAMP_SUFFIX}`, Date.now().toString());
            }
        }
    });
}

/**
 * Get all accordion states for a notebook (for debugging)
 */
export function getAllAccordionStates() {
    const states = {};
    const keys = Object.keys(localStorage);

    keys.forEach(key => {
        if (key.startsWith(STORAGE_PREFIX) && !key.endsWith(TIMESTAMP_SUFFIX)) {
            states[key] = JSON.parse(localStorage.getItem(key) || '{}');
        }
    });

    return states;
}

// Auto-cleanup on module load
if (typeof window !== 'undefined') {
    // Run cleanup on page load
    cleanupOldAccordionStates();

    // Schedule periodic cleanup (once per day)
    setInterval(cleanupOldAccordionStates, 24 * 60 * 60 * 1000);
}