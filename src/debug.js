/**
 * Debug and Tracing Module for Syma Runtime
 *
 * Provides configurable tracing, step logging, and projection debugging
 * for the symbolic runtime system.
 */

import { show, isSym, isCall } from './ast-helpers.js';

/* -------- Trace Configuration -------- */
/**
 * Check if tracing is enabled via:
 *   1) URL query parameter ?trace
 *   2) window.SYMA_DEV_TRACE = true
 */
export const isTraceEnabled = () => {
    try {
        const q = new URLSearchParams(window.location.search);
        if (q.has('trace')) return true;
        if (typeof window !== 'undefined' && window.SYMA_DEV_TRACE === true) return true;
    } catch (_) {
    }
    return false;
};

/**
 * Dynamic toggle for trace in console
 * @param {boolean} v - Enable/disable tracing
 * @returns {boolean} The new trace state
 */
export function setTrace(v) {
    try {
        window.SYMA_DEV_TRACE = !!v;
    } catch (_) {
    }
    return !!v;
}

/* -------- Step Formatting -------- */
/**
 * Format a rewrite step for console output
 * @param {Object} step - Step containing rule, path, before, after
 * @returns {string} Formatted step string
 */
export function formatStep(step) {
    const pathStr = Array.isArray(step.path) ? `[${step.path.join(".")}]` : "[]";
    return `#${step.i} ${step.rule || "<host/prim>"} ${pathStr}: ${show(step.before)} -> ${show(step.after)}`;
}

/* -------- Console Logging Helpers -------- */
/**
 * Log a group of trace steps to console
 * @param {string} title - Group title
 * @param {Array} trace - Array of trace steps
 */
export function logTraceGroup(title, trace) {
    try {
        console.groupCollapsed?.(title);
        trace.forEach(step => console.log(formatStep(step)));
        console.groupEnd?.();
    } catch (_) {
    }
}

/**
 * Log a dispatch action trace
 * @param {*} actionTerm - The action being dispatched
 * @param {Array} trace - Array of trace steps
 */
export function logDispatchTrace(actionTerm, trace) {
    logTraceGroup(`[SYMA TRACE] dispatch ${show(actionTerm)}`, trace);
}

/**
 * Log a projection trace
 * @param {*} part - The part being projected
 * @param {Array} trace - Array of trace steps
 */
export function logProjectionTrace(part, trace) {
    logTraceGroup(`[SYMA TRACE] project ${show(part)}`, trace);
}

/* -------- Projection Debugging -------- */
/**
 * Try to match a pattern against a subject (safe wrapper)
 * @param {*} pat - Pattern to match
 * @param {*} subj - Subject to match against
 * @returns {boolean} Whether the match succeeded
 */
function tryMatchBool(pat, subj) {
    try {
        return match(pat, subj, {}) !== null;
    } catch (_) {
        return false;
    }
}

/**
 * Explain why a projection failed to match any rules
 * @param {*} annotated - The annotated /@ expression
 * @param {Array} rules - Available rules
 * @returns {Array} Diagnostic information for each candidate rule
 */
export function explainProjectionFailure(annotated, rules) {
    const out = [];
    const lhsCandidates = rules.filter(r => isCall(r.lhs) && isSym(r.lhs.h) && r.lhs.h.v === "/@");

    for (const r of lhsCandidates) {
        const pat = r.lhs;
        const headOK = true; // filtered by "/@"
        const arityOK = isCall(pat) && isCall(annotated) && pat.a.length === annotated.a.length;
        let partOK = false, ctxOK = false;

        if (arityOK) {
            // Check first arg (the Show[...] part) in isolation
            partOK = tryMatchBool(pat.a[0], annotated.a[0]);
            // Check second arg (the App[State[..], _]) in isolation
            ctxOK = tryMatchBool(pat.a[1], annotated.a[1]);
        }

        out.push({
            rule: r.name,
            headOK,
            arityOK,
            partOK,
            ctxOK,
            lhs: show(r.lhs)
        });
    }

    return out;
}

/**
 * Log projection failure diagnostics
 * @param {*} part - The part that failed to project
 * @param {*} annotated - The annotated /@ expression
 * @param {*} reduced - The reduced result
 * @param {Array} rules - Available rules
 */
export function logProjectionFailure(part, annotated, reduced, rules) {
    try {
        const hints = explainProjectionFailure(annotated, rules)
            .filter(h => h.headOK)
            .slice(0, 8);

        console.groupCollapsed?.(`[SYMA HINT] /@ failed for ${show(part)} in context; result=${show(reduced)}`);
        console.log("Annotated:", show(annotated));

        if (hints.length === 0) {
            console.log("No /@ rules found. Ensure a rule like (R \"ShowX\" (/@ (Show X) (App (State ...) _)) ... ) exists.");
        } else {
            console.table(hints);
        }

        console.groupEnd?.();
    } catch (_) {}
}

/* -------- Trace State Management -------- */
let TRACE_ENABLED = isTraceEnabled();

/**
 * Get current trace state
 * @returns {boolean} Whether tracing is enabled
 */
export function getTraceState() {
    return TRACE_ENABLED;
}

/**
 * Update trace state (for HMR or dynamic changes)
 */
export function updateTraceState() {
    TRACE_ENABLED = isTraceEnabled();
}

/* -------- Export Debug API -------- */
export default {
    isTraceEnabled,
    setTrace,
    formatStep,
    logTraceGroup,
    logDispatchTrace,
    logProjectionTrace,
    explainProjectionFailure,
    logProjectionFailure,
    getTraceState,
    updateTraceState
};