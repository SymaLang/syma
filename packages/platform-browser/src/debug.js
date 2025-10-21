/**
 * Debug and Tracing Module for Syma Runtime
 *
 * Provides configurable tracing, step logging, and projection debugging
 * for the symbolic runtime system.
 */

import { show, isSym, isCall, isStr, isNum } from '@syma/core/ast-helpers';

/* -------- Console Styling -------- */
const styles = {
    rule: 'color: #0969da; font-weight: bold',
    path: 'color: #8250df',
    arrow: 'color: #cf222e; font-weight: bold',
    before: 'color: #57606a',  // Darker gray for better contrast
    after: 'color: #1a7f37; font-weight: bold',
    step: 'color: #8250df',
    header: 'color: #0969da; font-weight: bold; font-size: 1.1em',
    hint: 'color: #fb8500; font-style: italic',
    error: 'color: #cf222e; font-weight: bold',
    dim: 'color: #57606a; font-style: italic',  // Darker gray
    success: 'color: #1a7f37',
    warning: 'color: #fb8500',
    code: 'font-family: monospace; background: #f6f8fa; color: #0969da; padding: 2px 4px; border-radius: 3px; font-weight: bold'  // Better code styling
};

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

/* -------- Expression Formatting -------- */
/**
 * Truncate long expressions for display
 * @param {*} expr - Expression to show
 * @param {number} maxLen - Maximum length
 * @returns {string} Formatted expression
 */
function showCompact(expr, maxLen = 100) {
    const s = show(expr);
    if (s.length <= maxLen) return s;

    // For very long expressions, try to show the important parts
    const halfLen = Math.floor((maxLen - 5) / 2);
    return s.substring(0, halfLen) + ' ... ' + s.substring(s.length - halfLen);
}

/**
 * Format path for display
 * @param {Array} path - Path array
 * @returns {string} Formatted path
 */
function formatPath(path) {
    if (!Array.isArray(path) || path.length === 0) return 'root';
    return path.map(p => p === 'h' ? 'head' : `arg[${p}]`).join(' → ');
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

/**
 * Format a rewrite step with rich console styling
 * @param {Object} step - Step containing rule, path, before, after
 */
export function formatStepRich(step) {
    const stepNum = String(step.i).padStart(3, ' ');
    const ruleName = step.rule || "<primitive>";
    const path = formatPath(step.path);
    const verbosity = getVerbosity();

    // Adjust display based on verbosity
    if (verbosity === 'minimal') {
        // Minimal: just rule name and path
        console.log(
            `%c${stepNum}%c │ %c${ruleName}%c @ %c${path}%c`,
            styles.step, 'color: #6e7781',
            styles.rule, 'color: default',
            styles.path, 'color: default'
        );
        return;
    }

    // Get full strings
    const beforeStr = show(step.before);
    const afterStr = show(step.after);

    // For 'full' verbosity, never truncate
    if (verbosity === 'full') {
        console.log(
            `%c${stepNum}%c │ %c${ruleName}%c @ %c${path}%c\n` +
            `     %cBEFORE:%c\n     %c${beforeStr}%c\n` +
            `     %cAFTER:%c\n     %c${afterStr}%c`,
            styles.step, 'color: #6e7781',
            styles.rule, 'color: default',
            styles.path, 'color: default',
            styles.dim, 'color: default',
            styles.before, 'color: default',
            styles.dim, 'color: default',
            styles.after, 'color: default'
        );
        return;
    }

    // Determine max lengths based on verbosity
    const maxLen = verbosity === 'verbose' ? 200 : 120;
    const shortLen = verbosity === 'verbose' ? 120 : 80;

    // Format expressions based on length and verbosity
    let before, after;
    if (beforeStr.length <= shortLen && afterStr.length <= shortLen) {
        // Short expressions: show full
        before = beforeStr;
        after = afterStr;
    } else {
        // Longer expressions: truncate based on verbosity
        before = beforeStr.length <= maxLen ? beforeStr : showCompact(step.before, maxLen);
        after = afterStr.length <= maxLen ? afterStr : showCompact(step.after, maxLen);
    }

    // Display with appropriate layout
    if (before.length <= 80 && after.length <= 80) {
        console.log(
            `%c${stepNum}%c │ %c${ruleName}%c @ %c${path}%c\n` +
            `     %c${before}%c\n` +
            `     %c→%c %c${after}%c`,
            styles.step, 'color: #6e7781',
            styles.rule, 'color: default',
            styles.path, 'color: default',
            styles.before, 'color: default',
            styles.arrow, 'color: default',
            styles.after, 'color: default'
        );
    } else {
        // Multi-line for longer expressions
        console.log(
            `%c${stepNum}%c │ %c${ruleName}%c @ %c${path}%c\n` +
            `     %c${before}%c\n` +
            `     %c→%c\n` +
            `     %c${after}%c`,
            styles.step, 'color: #6e7781',
            styles.rule, 'color: default',
            styles.path, 'color: default',
            styles.before, 'color: default',
            styles.arrow, 'color: default',
            styles.after, 'color: default'
        );
    }
}

/* -------- Console Logging Helpers -------- */
/**
 * Log a group of trace steps to console
 * @param {string} title - Group title
 * @param {Array} trace - Array of trace steps
 * @param {boolean} useRichFormat - Use rich formatting
 */
export function logTraceGroup(title, trace, useRichFormat = true) {
    try {
        const isEmpty = !trace || trace.length === 0;
        const icon = isEmpty ? '○' : '●';
        const countStr = isEmpty ? 'no steps' : `${trace.length} step${trace.length === 1 ? '' : 's'}`;

        console.groupCollapsed?.(
            `%c${icon} ${title}%c (${countStr})`,
            styles.header,
            styles.dim
        );

        if (!isEmpty) {
            if (useRichFormat) {
                trace.forEach(step => formatStepRich(step));
            } else {
                trace.forEach(step => console.log(formatStep(step)));
            }

            // Summary
            console.log(
                `%c═══════════════════════════════════════`,
                styles.dim
            );
            console.log(
                `%cCompleted: ${trace.length} rewrite${trace.length === 1 ? '' : 's'}`,
                styles.success
            );
        }

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
    const actionStr = show(actionTerm);
    // For simple actions, show full; for complex, show compact
    const displayStr = actionStr.length <= 60 ? actionStr : showCompact(actionTerm, 60);
    logTraceGroup(`DISPATCH: ${displayStr}`, trace);
}

/**
 * Log a projection trace
 * @param {*} part - The part being projected
 * @param {Array} trace - Array of trace steps
 */
export function logProjectionTrace(part, trace) {
    const partStr = show(part);
    // For simple projections, show full; for complex, show compact
    const displayStr = partStr.length <= 60 ? partStr : showCompact(part, 60);
    logTraceGroup(`PROJECT: ${displayStr}`, trace);
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

        const partStr = showCompact(part, 40);
        const resultStr = showCompact(reduced, 40);

        console.groupCollapsed?.(
            `%c⚠ Projection Failed: ${partStr}%c → ${resultStr}`,
            styles.warning,
            styles.error
        );

        console.log(
            `%cExpected:%c /@ to reduce to Str or Num\n` +
            `%cReceived:%c ${show(reduced)}`,
            styles.dim, 'color: default',
            styles.dim, styles.error
        );

        console.log(
            `\n%cAnnotated Expression:%c\n${show(annotated)}`,
            styles.dim, 'color: default'
        );

        if (hints.length === 0) {
            console.log(
                `\n%c💡 Hint:%c No /@ rules found.\n` +
                `Ensure a rule like: %c(R "ShowX" (/@ (Show X) (App (State ...) _)) ...)%c exists.`,
                styles.hint, 'color: default',
                'font-family: monospace; background: #f6f8fa; padding: 2px 4px;', 'color: default'
            );
        } else {
            console.log(`\n%cCandidate Rules:%c`, styles.dim, 'color: default');

            // Create a formatted table with better display
            const formattedHints = hints.map(h => ({
                '✓': `${h.arityOK ? '✓' : '✗'} arity`,
                'Part': h.partOK ? '✓ match' : '✗ no match',
                'Context': h.ctxOK ? '✓ match' : '✗ no match',
                'Rule': h.rule,
                'Pattern': showCompact(h.lhs, 50)
            }));

            console.table(formattedHints);

            // Provide specific guidance
            const failedPart = hints.filter(h => !h.partOK).length === hints.length;
            const failedContext = hints.filter(h => !h.ctxOK).length === hints.length;

            if (failedPart && !failedContext) {
                console.log(
                    `%c💡 All rules failed to match the first argument (${showCompact(part, 30)})`,
                    styles.hint
                );
            } else if (!failedPart && failedContext) {
                console.log(
                    `%c💡 All rules failed to match the context (App state)`,
                    styles.hint
                );
            }
        }

        console.groupEnd?.();
    } catch (_) {}
}

/* -------- Trace Statistics -------- */
/**
 * Analyze trace statistics
 * @param {Array} trace - Array of trace steps
 * @returns {Object} Statistics about the trace
 */
export function analyzeTrace(trace) {
    if (!trace || trace.length === 0) {
        return { totalSteps: 0, ruleFrequency: {}, pathDepths: [] };
    }

    const ruleFrequency = {};
    const pathDepths = [];

    trace.forEach(step => {
        // Count rule frequency
        const ruleName = step.rule || '<primitive>';
        ruleFrequency[ruleName] = (ruleFrequency[ruleName] || 0) + 1;

        // Track path depths
        if (Array.isArray(step.path)) {
            pathDepths.push(step.path.length);
        }
    });

    // Sort rules by frequency
    const topRules = Object.entries(ruleFrequency)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    return {
        totalSteps: trace.length,
        ruleFrequency,
        topRules,
        pathDepths,
        avgDepth: pathDepths.length > 0
            ? (pathDepths.reduce((a, b) => a + b, 0) / pathDepths.length).toFixed(2)
            : 0,
        maxDepth: Math.max(...pathDepths, 0)
    };
}

/**
 * Log trace statistics
 * @param {Array} trace - Array of trace steps
 */
export function logTraceStats(trace) {
    const stats = analyzeTrace(trace);

    if (stats.totalSteps === 0) return;

    console.log(
        `%cTrace Statistics:%c\n` +
        `  Total rewrites: ${stats.totalSteps}\n` +
        `  Avg depth: ${stats.avgDepth} | Max depth: ${stats.maxDepth}\n` +
        `  Top rules:`,
        styles.header, 'color: default'
    );

    stats.topRules.forEach(([rule, count]) => {
        const bar = '█'.repeat(Math.ceil(count / stats.totalSteps * 20));
        console.log(
            `    %c${bar}%c ${rule}: ${count}x`,
            styles.success, 'color: default'
        );
    });
}

/* -------- Trace State Management -------- */
let TRACE_ENABLED = isTraceEnabled();
let VERBOSITY_LEVEL = 'normal'; // 'minimal', 'normal', 'verbose', 'full'

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

/**
 * Set verbosity level for trace output
 * @param {string} level - 'minimal', 'normal', 'verbose', or 'full'
 */
export function setVerbosity(level) {
    if (['minimal', 'normal', 'verbose', 'full'].includes(level)) {
        VERBOSITY_LEVEL = level;
        console.log(`%cVerbosity set to: ${level}`, styles.success);
    } else {
        console.log(`%cInvalid verbosity level. Use 'minimal', 'normal', 'verbose', or 'full'`, styles.error);
    }
    return VERBOSITY_LEVEL;
}

/**
 * Get current verbosity level
 * @returns {string} Current verbosity level
 */
export function getVerbosity() {
    return VERBOSITY_LEVEL;
}

/* -------- Interactive Debugging -------- */
/**
 * Enable interactive debugging in console
 */
export function enableInteractiveDebug() {
    if (typeof window === 'undefined') return;

    window.symaDebug = {
        trace: (enable = true) => {
            setTrace(enable);
            console.log(`%cTracing ${enable ? 'enabled' : 'disabled'}`, enable ? styles.success : styles.dim);
            return enable;
        },
        verbosity: (level) => {
            if (!level) {
                console.log(`%cCurrent verbosity: ${getVerbosity()}`, styles.dim);
                return getVerbosity();
            }
            return setVerbosity(level);
        },
        help: () => {
            console.log(
                `%cSyma Debug Commands:%c\n\n` +
                `  %csymaDebug.trace(true/false)%c - Toggle tracing\n` +
                `  %csymaDebug.verbosity(level)%c - Set verbosity level\n` +
                `      'minimal'  - Rule names only\n` +
                `      'normal'   - Truncate at ~120 chars (default)\n` +
                `      'verbose'  - Truncate at ~200 chars\n` +
                `      'full'     - Show everything, no truncation\n` +
                `  %csymaDebug.stats()%c - Show last trace statistics\n` +
                `  %csymaDebug.clear()%c - Clear console\n` +
                `  %cAdd ?trace to URL%c - Enable trace on load\n\n` +
                `Current settings:\n` +
                `  Tracing: ${getTraceState() ? 'enabled' : 'disabled'}\n` +
                `  Verbosity: ${getVerbosity()}`,
                styles.header, 'color: default',
                styles.code, 'color: default',
                styles.code, 'color: default',
                styles.code, 'color: default',
                styles.code, 'color: default',
                styles.code, 'color: default'
            );
        },
        stats: () => {
            console.log('%cNo trace data available. Enable tracing first.', styles.dim);
        },
        clear: () => {
            console.clear();
            console.log('%cConsole cleared', styles.success);
        }
    };

    console.log(
        `%c🔍 Syma Debug Mode%c\nType %csymaDebug.help()%c for commands`,
        styles.header, 'color: default',
        styles.code, 'color: default'
    );
}

// Auto-enable interactive debug if trace is on
if (isTraceEnabled()) {
    enableInteractiveDebug();
}

/* -------- Export Debug API -------- */
export default {
    // Core functions
    isTraceEnabled,
    setTrace,
    formatStep,
    formatStepRich,

    // Logging
    logTraceGroup,
    logDispatchTrace,
    logProjectionTrace,
    logProjectionFailure,

    // Analysis
    explainProjectionFailure,
    analyzeTrace,
    logTraceStats,

    // State management
    getTraceState,
    updateTraceState,

    // Interactive
    enableInteractiveDebug,

    // Utilities
    showCompact,
    formatPath
};