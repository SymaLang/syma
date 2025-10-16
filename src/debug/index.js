/*****************************************************************
 * Debug Module
 *
 * Exports all debug-related components
 ******************************************************************/

export { DebugOverlay } from './DebugOverlay.js';
export { ProgramSection } from './ProgramSection.js';
export { RulesSection } from './RulesSection.js';
export { fuzzyMatch, highlightMatches } from './utils.js';
export {
    tokenize,
    highlight,
    createHighlightedCodeElement,
    getColorForType
} from './syntax-highlighter.js';
