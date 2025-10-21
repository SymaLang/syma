/*****************************************************************
 * Node.js-specific REPL extensions
 *
 * Provides Autocompleter with Node.js dependencies (fs, glob)
 ******************************************************************/

import { Autocompleter } from './autocomplete.js';

/**
 * Create Node.js-specific autocompleter
 * @param {Object} commandProcessor - The command processor
 * @returns {Autocompleter} Autocompleter with Node.js file completion
 */
export function createNodeAutocompleter(commandProcessor) {
    return new Autocompleter(commandProcessor);
}
