/*****************************************************************
 * @syma/core - Platform-independent Syma runtime engine
 *
 * Main entry point that re-exports the core API:
 * - Engine: normalization, pattern matching, rule application
 * - AST Helpers: constructing and manipulating symbolic expressions
 * - Primitives: built-in operations
 * - Parser: S-expression parsing
 * - Module Compiler: module bundling and compilation
 * - Effects: effects processing
 * - Platform: platform abstraction interface
 ******************************************************************/

// Core engine
export {
    findSection,
    extractRulesFromNode,
    extractRules,
    match,
    subst,
    applyOnce,
    applyOnceTrace,
    normalize,
    normalizeWithTrace,
    getProgram,
    enrichProgramWithEffects,
    getProgramApp,
    setProgram,
    setProgramApp,
    dispatch,
    applyRuleRules
} from './core/engine.js';

// AST Helpers
export {
    K,
    Sym,
    Num,
    Str,
    Call,
    Var,
    VarRest,
    Splice,
    isSym,
    isNum,
    isStr,
    isCall,
    isVar,
    isVarRest,
    isSplice,
    symEq,
    deq,
    clone,
    show
} from './ast-helpers.js';

// Primitives
export {
    foldPrims,
    getMetaSafePrimitives
} from './primitives.js';

// Utilities
export {
    freshId
} from './utils.js';

// Parser
export {
    createParser,
    createParserSync
} from './core/parser-factory.js';

export {
    SymaParser
} from './core/parser.js';

export {
    TreeSitterParser
} from './core/tree-sitter-parser.js';

// Module Compiler
export {
    Module,
    ModuleCompiler,
    ModuleCompilerPlatform
} from './core/module-compiler.js';

// Effects
export {
    createEffectsProcessor
} from './effects/processor.js';

// Platform
export {
    setPlatform,
    getPlatform
} from './platform/index.js';
