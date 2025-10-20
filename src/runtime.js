/*****************************************************************
 * Browser Runtime - Platform-specific implementation
 * - Loads Universe AST
 * - Uses platform-independent core engine
 * - Renders UI to DOM via projectors
 * - Handles browser-specific initialization
 ******************************************************************/

import { show } from './ast-helpers.js';
import { clearInput, getInputValue } from './events.js';
import { foldPrims } from './primitives.js';
import {
    isTraceEnabled,
    setTrace as debugSetTrace,
    formatStep,
    logDispatchTrace
} from './debug.js';
import { ProjectorFactory } from './projectors/index.js';
import { SymaParser } from './core/parser.js';
import { DebugOverlay } from './debug/index.js';

// Import platform-independent core
import {
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
    dispatch as coreDispatch,
    applyRuleRules
} from './core/engine.js';

// Import platform abstraction and effects
import { setPlatform, getPlatform } from './platform/index.js';
import { BrowserPlatform } from './platform/browser.js';
import { createEffectsProcessor, freshId } from './effects/processor.js';

/* -------- Dev trace toggle -------- */
const SYMA_DEV_TRACE = isTraceEnabled();

/* Inject an action: Program := Normalize( Apply[action, Program] ) */
function dispatch(universe, rules, actionTerm) {
    // Create a trace function if tracing is enabled
    const traceFn = SYMA_DEV_TRACE ? logDispatchTrace : null;

    // Use the core dispatch function with foldPrims
    return coreDispatch(universe, rules, actionTerm, foldPrims, traceFn);
}

/* --------------------- Boot glue ----------------------------- */
let GLOBAL_UNIVERSE = null;
let GLOBAL_RULES = null;
let GLOBAL_PROJECTOR = null;
let GLOBAL_PLATFORM = null;
let GLOBAL_EFFECTS_PROCESSOR = null;
let GLOBAL_DEBUG_OVERLAY = null;

async function boot(universeOrUrl, mountSelector = "#app", projectorType = "dom", options = {}) {
    let uni;
    const { debug = false } = options;

    // Initialize browser platform
    GLOBAL_PLATFORM = new BrowserPlatform();
    setPlatform(GLOBAL_PLATFORM);

    // Check if it's a URL string or a direct AST object
    if (typeof universeOrUrl === 'string') {
        // Legacy mode: fetch from URL
        const res = await fetch(universeOrUrl);
        if (!res.ok) throw new Error(`Failed to load universe: ${res.status}`);
        uni = await res.json();
    } else {
        // Direct import mode: use the AST directly
        uni = universeOrUrl;
    }

    // Enrich Program with Effects if missing (for backward compatibility)
    uni = enrichProgramWithEffects(uni);

    // Apply RuleRules to transform the Universe itself
    // This makes the transformations permanent in the Universe data structure
    // Use plain foldPrims here (no universe context needed during meta-rule processing)
    uni = applyRuleRules(uni, (expr, skipFolds = []) => foldPrims(expr, skipFolds));

    GLOBAL_UNIVERSE = uni;
    GLOBAL_RULES = extractRules(uni);

    // Normalize the Program on initial load to apply any startup rules
    // Use plain foldPrims here (ProjectToString shouldn't be used during initialization)
    const initialProgram = getProgram(GLOBAL_UNIVERSE);
    if (initialProgram) {
        const normalized = normalize(initialProgram, GLOBAL_RULES, 10000, false, (expr, skipFolds = []) => foldPrims(expr, skipFolds));
        GLOBAL_UNIVERSE = setProgram(GLOBAL_UNIVERSE, normalized);
    }

    const mount = document.querySelector(mountSelector);
    if (!mount) throw new Error(`Mount not found: ${mountSelector}`);

    // Create context-aware foldPrims wrapper
    // This captures the universe context needed by special primitives like ProjectToString
    const createFoldPrimsWithContext = () => (expr, skipFolds = []) => {
        const context = {
            universe: GLOBAL_UNIVERSE,
            normalizeFunc: normalizeBound,
            extractRulesFunc: extractRules
        };
        return foldPrims(expr, skipFolds, context);
    };

    // Bind normalize functions with context-aware foldPrims
    // Note: These need to be defined before createFoldPrimsWithContext uses them
    let foldPrimsWithContext = createFoldPrimsWithContext();

    const normalizeBound = (expr, rules, maxSteps = 10000, skipPrims = false) => {
        return normalize(expr, rules, maxSteps, skipPrims, foldPrimsWithContext);
    };

    const normalizeWithTraceBound = (expr, rules, maxSteps = 10000, skipPrims = false) => {
        return normalizeWithTrace(expr, rules, maxSteps, skipPrims, foldPrimsWithContext);
    };

    // Recreate foldPrimsWithContext now that normalizeBound is defined
    foldPrimsWithContext = createFoldPrimsWithContext();

    // Create and initialize projector
    GLOBAL_PROJECTOR = ProjectorFactory.create(projectorType, {
        mount,
        onDispatch: null, // Will be set after defining dispatchAction
        options: {
            universe: GLOBAL_UNIVERSE,
            normalize: normalizeBound,
            normalizeWithTrace: normalizeWithTraceBound,
            extractRules
        }
    });

    const dispatchAction = (action) => {
        // Inject Apply[action, Program] normalization
        GLOBAL_UNIVERSE = dispatch(GLOBAL_UNIVERSE, GLOBAL_RULES, action);
        GLOBAL_PROJECTOR.universe = GLOBAL_UNIVERSE;
        GLOBAL_PROJECTOR.render(GLOBAL_UNIVERSE);

        // Notify debug overlay of universe change
        if (GLOBAL_DEBUG_OVERLAY) {
            GLOBAL_DEBUG_OVERLAY.onUniverseUpdate();
        }
    };

    // Set the dispatch handler
    GLOBAL_PROJECTOR.onDispatch = dispatchAction;

    // Initial render
    GLOBAL_PROJECTOR.render(GLOBAL_UNIVERSE);

    // Create effects processor using platform abstraction
    GLOBAL_EFFECTS_PROCESSOR = createEffectsProcessor(
        GLOBAL_PLATFORM,
        () => getProgram(GLOBAL_UNIVERSE),
        (newProg) => {
            // After effects update, normalize to trigger inbox processing rules
            const normalized = normalizeBound(newProg, GLOBAL_RULES);
            GLOBAL_UNIVERSE = setProgram(GLOBAL_UNIVERSE, normalized);
        },
        () => {
            // Re-render after effects update
            GLOBAL_PROJECTOR.universe = GLOBAL_UNIVERSE;
            GLOBAL_PROJECTOR.render(GLOBAL_UNIVERSE);

            // Notify debug overlay of universe change
            if (GLOBAL_DEBUG_OVERLAY) {
                GLOBAL_DEBUG_OVERLAY.onUniverseUpdate();
            }
        }
    );

    // Initialize debug overlay if requested
    if (debug) {
        const parser = new SymaParser();
        GLOBAL_DEBUG_OVERLAY = new DebugOverlay({
            parser,
            getUniverse: () => GLOBAL_UNIVERSE
        });
        console.log('[Syma Debug] Debug overlay initialized. Press Ctrl+D (or Cmd+D) to toggle.');
    } else {
        GLOBAL_DEBUG_OVERLAY = null;
    }

    // Return a handle for HMR and testing
    return {
        universe: GLOBAL_UNIVERSE,
        projector: GLOBAL_PROJECTOR,
        platform: GLOBAL_PLATFORM,
        debugOverlay: GLOBAL_DEBUG_OVERLAY,
        reload: () => {
            // Re-enrich in case the reloaded version doesn't have Effects
            uni = enrichProgramWithEffects(uni);
            GLOBAL_UNIVERSE = uni;
            GLOBAL_RULES = extractRules(uni);
            GLOBAL_PROJECTOR.universe = GLOBAL_UNIVERSE;
            GLOBAL_PROJECTOR.render(GLOBAL_UNIVERSE);

            // Notify debug overlay of universe change
            if (GLOBAL_DEBUG_OVERLAY) {
                GLOBAL_DEBUG_OVERLAY.onUniverseUpdate();
            }
        },
        effectsProcessor: GLOBAL_EFFECTS_PROCESSOR
    };
}

/* --------------------- Expose API ---------------------------- */

// Create wrapped functions for export with universe context
const normalizeBrowser = (expr, rules, maxSteps = 10000, skipPrims = false) => {
    // Create context-aware foldPrims if GLOBAL_UNIVERSE is available
    const foldPrimsFn = GLOBAL_UNIVERSE ? (e, skipFolds = []) => {
        const context = {
            universe: GLOBAL_UNIVERSE,
            normalizeFunc: normalizeBrowser,
            extractRulesFunc: extractRules
        };
        return foldPrims(e, skipFolds, context);
    } : (e, skipFolds = []) => foldPrims(e, skipFolds);

    return normalize(expr, rules, maxSteps, skipPrims, foldPrimsFn);
};

const normalizeWithTraceBrowser = (expr, rules, maxSteps = 10000, skipPrims = false) => {
    // Create context-aware foldPrims if GLOBAL_UNIVERSE is available
    const foldPrimsFn = GLOBAL_UNIVERSE ? (e, skipFolds = []) => {
        const context = {
            universe: GLOBAL_UNIVERSE,
            normalizeFunc: normalizeBrowser,
            extractRulesFunc: extractRules
        };
        return foldPrims(e, skipFolds, context);
    } : (e, skipFolds = []) => foldPrims(e, skipFolds);

    return normalizeWithTrace(expr, rules, maxSteps, skipPrims, foldPrimsFn);
};

window.SymbolicHost = {
    boot,
    show,
    dispatch,
    normalize: normalizeBrowser,
    normalizeWithTrace: normalizeWithTraceBrowser,
    formatStep,
    freshId,
    getProjector: () => GLOBAL_PROJECTOR,
    getProjectorTypes: () => ProjectorFactory.getAvailable(),
    getPlatform: () => GLOBAL_PLATFORM
};

Object.defineProperty(window, "GLOBAL_UNIVERSE", {
    get: () => GLOBAL_UNIVERSE
});
Object.defineProperty(window, "GLOBAL_RULES", {
    get: () => GLOBAL_RULES
});
Object.defineProperty(window, "GLOBAL_PROJECTOR", {
    get: () => GLOBAL_PROJECTOR
});
Object.defineProperty(window, "GLOBAL_PLATFORM", {
    get: () => GLOBAL_PLATFORM
});
Object.defineProperty(window, "GLOBAL_DEBUG_OVERLAY", {
    get: () => GLOBAL_DEBUG_OVERLAY
});

// Dynamic toggle for trace in console: SymbolicHost.setTrace(true/false)
const setTrace = debugSetTrace;
window.SymbolicHost = {...window.SymbolicHost, setTrace};

export {
    boot,
    show,
    dispatch,
    normalizeBrowser as normalize,
    normalizeWithTraceBrowser as normalizeWithTrace,
    extractRules,
    clearInput,
    getInputValue,
    freshId
};