/*****************************************************************
 * Parser Factory
 *
 * Provides a unified interface for creating parsers.
 * Can use either the original hand-written parser or the
 * tree-sitter based parser depending on configuration.
 ******************************************************************/

import { SymaParser as OriginalParser } from './parser.js';

let cachedTreeSitterParser = null;

export async function createParser(options = {}) {
    const { useTreeSitter = false } = options;

    if (!useTreeSitter) {
        // Use original hand-written parser
        return new OriginalParser();
    }

    // Try to use tree-sitter parser
    try {
        if (!cachedTreeSitterParser) {
            const { createTreeSitterParser } = await import('./tree-sitter-parser.js');
            cachedTreeSitterParser = await createTreeSitterParser();
        }
        return cachedTreeSitterParser;
    } catch (error) {
        console.warn('Tree-sitter parser not available, falling back to original parser:', error.message);
        return new OriginalParser();
    }
}

// Synchronous version that always uses the original parser
export function createParserSync() {
    return new OriginalParser();
}

// Export the original parser for backward compatibility
export { SymaParser } from './parser.js';