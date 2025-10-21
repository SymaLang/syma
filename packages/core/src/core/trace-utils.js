/*****************************************************************
 * Trace Utilities
 *
 * Helper functions for processing and displaying trace output
 ******************************************************************/

/**
 * Collapse consecutive applications of the same rule at the same path
 */
export function collapseConsecutiveRules(trace) {
    if (!trace || trace.length === 0) return [];

    const collapsed = [];
    let currentGroup = null;

    for (const step of trace) {
        const pathStr = step.path ? step.path.join(',') : '';
        const ruleKey = `${step.rule}@${pathStr}`;

        if (!currentGroup) {
            // Start first group
            currentGroup = {
                startStep: step.i + 1,
                endStep: step.i + 1,
                rule: step.rule,
                path: step.path,
                pathStr: pathStr,
                ruleKey: ruleKey,
                count: 1,
                steps: [step]
            };
        } else if (currentGroup.ruleKey === ruleKey) {
            // Continue current group
            currentGroup.endStep = step.i + 1;
            currentGroup.count++;
            currentGroup.steps.push(step);
        } else {
            // Different rule, save current group and start new one
            collapsed.push(currentGroup);
            currentGroup = {
                startStep: step.i + 1,
                endStep: step.i + 1,
                rule: step.rule,
                path: step.path,
                pathStr: pathStr,
                ruleKey: ruleKey,
                count: 1,
                steps: [step]
            };
        }
    }

    // Add the last group
    if (currentGroup) {
        collapsed.push(currentGroup);
    }

    return collapsed;
}

/**
 * Format collapsed trace for display
 */
export function formatCollapsedTrace(collapsedGroups, indent = '  ') {
    const lines = [];

    for (const group of collapsedGroups) {
        if (group.count === 1) {
            // Single application - show normally
            lines.push(`${indent}Step ${group.startStep}: Rule "${group.rule}" at path [${group.pathStr}]`);
        } else if (group.count === 2) {
            // Just two applications - show both
            lines.push(`${indent}Step ${group.startStep}: Rule "${group.rule}" at path [${group.pathStr}]`);
            lines.push(`${indent}Step ${group.endStep}: Rule "${group.rule}" at path [${group.pathStr}]`);
        } else {
            // Multiple applications - collapse
            lines.push(`${indent}Steps ${group.startStep}-${group.endStep}: Rule "${group.rule}" at path [${group.pathStr}] (×${group.count})`);
        }
    }

    return lines.join('\n');
}

/**
 * Get statistics about rule applications from trace
 */
export function getTraceStats(trace) {
    const ruleCount = {};
    const pathCount = {};
    const rulePaths = {};

    for (const step of trace) {
        const rule = step.rule;
        const pathStr = step.path ? step.path.join(',') : '';

        // Count rule applications
        ruleCount[rule] = (ruleCount[rule] || 0) + 1;

        // Count path usage
        pathCount[pathStr] = (pathCount[pathStr] || 0) + 1;

        // Track rule-path combinations
        const rulePathKey = `${rule}@${pathStr}`;
        rulePaths[rulePathKey] = (rulePaths[rulePathKey] || 0) + 1;
    }

    // Find hot spots (rules that run many times)
    const hotRules = Object.entries(ruleCount)
        .filter(([_, count]) => count >= 5)
        .sort((a, b) => b[1] - a[1]);

    return {
        totalSteps: trace.length,
        uniqueRules: Object.keys(ruleCount).length,
        ruleCount,
        pathCount,
        rulePaths,
        hotRules
    };
}

/**
 * Format trace statistics for display
 */
export function formatTraceStats(stats) {
    const lines = [];

    lines.push(`Total steps: ${stats.totalSteps}`);
    lines.push(`Unique rules: ${stats.uniqueRules}`);

    if (stats.hotRules.length > 0) {
        lines.push('\nHot spots (rules applied ≥5 times):');
        for (const [rule, count] of stats.hotRules) {
            lines.push(`  ${rule}: ${count} times`);
        }
    }

    return lines.join('\n');
}