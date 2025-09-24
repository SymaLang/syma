/*****************************************************************
 * AST Diff Utility
 *
 * Provides diffing capabilities for AST nodes to show changes
 * in a compact, readable format
 ******************************************************************/

import { isSym, isStr, isNum, isCall, deq } from '../ast-helpers.js';
import { getMinimalTextDiff, formatTextDiff } from './text-diff.js';

// Diff types
export const DiffType = {
    UNCHANGED: 'unchanged',
    MODIFIED: 'modified',
    ADDED: 'added',
    REMOVED: 'removed'
};

/**
 * Compare two AST nodes and return a diff structure
 */
export function diffNodes(before, after, maxDepth = 10, currentDepth = 0) {
    // Prevent infinite recursion
    if (currentDepth > maxDepth) {
        return { type: DiffType.MODIFIED, before, after, truncated: true };
    }

    // If nodes are deeply equal, they're unchanged
    if (deq(before, after)) {
        return { type: DiffType.UNCHANGED, value: before };
    }

    // One is null/undefined
    if (!before) return { type: DiffType.ADDED, value: after };
    if (!after) return { type: DiffType.REMOVED, value: before };

    // Different node types
    if (before.k !== after.k) {
        return { type: DiffType.MODIFIED, before, after };
    }

    // Same type, check specifics
    if (isSym(before) || isStr(before) || isNum(before)) {
        // Leaf nodes - simple comparison
        if (before.v !== after.v) {
            return { type: DiffType.MODIFIED, before, after };
        }
        return { type: DiffType.UNCHANGED, value: before };
    }

    if (isCall(before) && isCall(after)) {
        // Compare heads
        const headDiff = diffNodes(before.h, after.h, maxDepth, currentDepth + 1);

        // Compare arguments
        const argDiffs = [];
        const maxLen = Math.max(before.a.length, after.a.length);

        for (let i = 0; i < maxLen; i++) {
            const beforeArg = i < before.a.length ? before.a[i] : null;
            const afterArg = i < after.a.length ? after.a[i] : null;
            argDiffs.push(diffNodes(beforeArg, afterArg, maxDepth, currentDepth + 1));
        }

        // Check if anything changed
        const hasChanges = headDiff.type !== DiffType.UNCHANGED ||
                          argDiffs.some(d => d.type !== DiffType.UNCHANGED);

        if (!hasChanges) {
            return { type: DiffType.UNCHANGED, value: before };
        }

        return {
            type: DiffType.MODIFIED,
            head: headDiff,
            args: argDiffs,
            before,
            after
        };
    }

    // Fallback for unknown types
    return { type: DiffType.MODIFIED, before, after };
}

/**
 * Find all change paths in a diff tree
 */
function findChangePaths(diff, currentPath = []) {
    const changes = [];

    if (!diff) return changes;

    if (diff.type === DiffType.ADDED || diff.type === DiffType.REMOVED ||
        (diff.type === DiffType.MODIFIED && (!diff.head || !diff.args))) {
        // Leaf change
        changes.push({
            path: currentPath,
            type: diff.type,
            before: diff.before || diff.value,
            after: diff.after || diff.value
        });
    } else if (diff.type === DiffType.MODIFIED && diff.head && diff.args) {
        // Check head
        if (diff.head.type !== DiffType.UNCHANGED) {
            changes.push(...findChangePaths(diff.head, [...currentPath, 'head']));
        }

        // Check args
        diff.args.forEach((argDiff, i) => {
            if (argDiff.type !== DiffType.UNCHANGED) {
                changes.push(...findChangePaths(argDiff, [...currentPath, 'arg', i]));
            }
        });
    }

    return changes;
}

/**
 * Format a path for display
 */
function formatPath(before, after, path, parser) {
    const pathStrs = [];
    let current = before;
    let skipNext = false;

    for (let i = 0; i < path.length; i++) {
        if (skipNext) {
            skipNext = false;
            continue;
        }

        const segment = path[i];

        if (segment === 'head') {
            pathStrs.push('head');
            if (current && isCall(current)) {
                current = current.h;
            }
        } else if (segment === 'arg') {
            const idx = path[++i];
            if (current && isCall(current)) {
                // Try to find a meaningful name for this argument position
                if (isSym(current.h)) {
                    const headName = current.h.v;
                    // Special cases for known structures
                    if (headName === 'Focus' && idx === 0) {
                        pathStrs.push('Focus.value');
                    } else if (headName === 'TokenizerState') {
                        // TokenizerState has: mode, parseMode, focus, tokens
                        const fieldNames = ['mode', 'parseMode', 'focus', 'tokens'];
                        if (idx < fieldNames.length) {
                            pathStrs.push(`TokenizerState.${fieldNames[idx]}`);
                        } else {
                            pathStrs.push(`TokenizerState.arg[${idx}]`);
                        }
                    } else if (headName === 'Tokens') {
                        pathStrs.push(`Tokens[${idx}]`);
                    } else if (headName === 'State' && idx === 0) {
                        pathStrs.push('State.value');
                    } else if (headName === 'App') {
                        const fieldNames = ['state', 'ui'];
                        if (idx < fieldNames.length) {
                            pathStrs.push(`App.${fieldNames[idx]}`);
                        } else {
                            pathStrs.push(`App.arg[${idx}]`);
                        }
                    } else if (headName === 'Apply' && idx < 2) {
                        pathStrs.push(idx === 0 ? 'Apply.action' : 'Apply.target');
                    } else if (headName === 'Add' || headName === 'Sub' || headName === 'Mul' || headName === 'Div') {
                        pathStrs.push(idx === 0 ? `${headName}.left` : `${headName}.right`);
                    } else if (headName === 'Cons' && idx < 2) {
                        pathStrs.push(idx === 0 ? 'Cons.head' : 'Cons.tail');
                    } else if (idx === 0 && current.a.length === 1) {
                        pathStrs.push(`${headName}.value`);
                    } else {
                        pathStrs.push(`${headName}.arg[${idx}]`);
                    }
                } else {
                    pathStrs.push(`arg[${idx}]`);
                }
                current = current.a[idx];
            } else {
                pathStrs.push(`arg[${idx}]`);
            }
        }
    }

    return pathStrs.join(' → ');
}

/**
 * Format a diff for display with smart focusing
 */
export function formatDiff(diff, parser, indent = 0) {
    const spaces = '  '.repeat(indent);

    if (!diff) return spaces + '(no diff)';

    // Find all changes in the diff tree
    const changes = findChangePaths(diff);

    if (changes.length === 0) {
        return null; // No changes
    }

    // If there's only one change deep in the tree, show it focused
    if (changes.length === 1) {
        const change = changes[0];
        const pathStr = formatPath(diff.before, diff.after, change.path, parser);

        const lines = [];

        // For very simple changes (like a single character), show inline
        const beforeStr = formatNode(change.before, parser, 60);
        const afterStr = formatNode(change.after, parser, 60);

        if (change.path.length > 1) {
            // Deep change - show path
            if (pathStr) {
                // Check if it's a very simple change (short strings/numbers)
                if (beforeStr.length < 10 && afterStr.length < 10) {
                    lines.push(spaces + `${pathStr}: ${beforeStr} → ${afterStr}`);
                } else {
                    lines.push(spaces + `In ${pathStr}:`);
                    lines.push(spaces + '  - ' + beforeStr);
                    lines.push(spaces + '  + ' + afterStr);
                }
            } else {
                lines.push(spaces + '  - ' + beforeStr);
                lines.push(spaces + '  + ' + afterStr);
            }
        } else {
            // Shallow change - just show the diff
            lines.push(spaces + '- ' + beforeStr);
            lines.push(spaces + '+ ' + afterStr);
        }
        return lines.join('\n');
    }

    // If there are multiple changes but they're all in the same subtree, group them
    if (changes.length > 1 && changes.length <= 3) {
        // Check if all changes share a common prefix path
        let commonPrefix = changes[0].path.slice();
        for (let i = 1; i < changes.length; i++) {
            const path = changes[i].path;
            let j = 0;
            while (j < commonPrefix.length && j < path.length &&
                   commonPrefix[j] === path[j]) {
                j++;
            }
            commonPrefix = commonPrefix.slice(0, j);
        }

        if (commonPrefix.length >= 2) {
            // All changes are in the same subtree
            const lines = [];
            const contextPath = formatPath(diff.before, diff.after, commonPrefix, parser);
            if (contextPath) {
                lines.push(spaces + `In ${contextPath}:`);
            }

            for (const change of changes) {
                const relativePath = change.path.slice(commonPrefix.length);
                if (relativePath.length > 0) {
                    const subPath = formatPath(
                        getNodeAtPath(diff.before, commonPrefix),
                        getNodeAtPath(diff.after, commonPrefix),
                        relativePath,
                        parser
                    );
                    lines.push(spaces + `  ${subPath}:`);
                    lines.push(spaces + '    - ' + formatNode(change.before, parser, 50));
                    lines.push(spaces + '    + ' + formatNode(change.after, parser, 50));
                } else {
                    lines.push(spaces + '  - ' + formatNode(change.before, parser, 60));
                    lines.push(spaces + '  + ' + formatNode(change.after, parser, 60));
                }
            }
            return lines.join('\n');
        }
    }

    // Too many changes or at shallow level - show full diff but compact
    if (diff.type === DiffType.MODIFIED && diff.before && diff.after) {
        const lines = [];

        // Special case: if it's a list-like structure (Tokens, etc.) and we're just appending
        if (isCall(diff.before) && isCall(diff.after) && isSym(diff.before.h) &&
            diff.before.h.v === diff.after.h.v) {
            const headName = diff.before.h.v;
            if (headName === 'Tokens' || headName === 'List' || headName === 'Effects') {
                // Check if we're just adding/removing items
                const beforeLen = diff.before.a.length;
                const afterLen = diff.after.a.length;

                if (afterLen > beforeLen) {
                    // Items were added
                    lines.push(spaces + `${headName}: added ${afterLen - beforeLen} item(s)`);
                    for (let i = beforeLen; i < afterLen; i++) {
                        lines.push(spaces + '  + ' + formatNode(diff.after.a[i], parser, 60));
                    }
                    return lines.join('\n');
                } else if (afterLen < beforeLen) {
                    // Items were removed
                    lines.push(spaces + `${headName}: removed ${beforeLen - afterLen} item(s)`);
                    for (let i = afterLen; i < beforeLen; i++) {
                        lines.push(spaces + '  - ' + formatNode(diff.before.a[i], parser, 60));
                    }
                    return lines.join('\n');
                }
            }
        }

        // Default: show compact before/after
        lines.push(spaces + '- ' + formatNode(diff.before, parser, 100));
        lines.push(spaces + '+ ' + formatNode(diff.after, parser, 100));
        return lines.join('\n');
    }

    return null;
}

/**
 * Get node at a specific path
 */
function getNodeAtPath(node, path) {
    let current = node;
    for (let i = 0; i < path.length; i++) {
        const segment = path[i];
        if (segment === 'head') {
            if (current && isCall(current)) {
                current = current.h;
            } else {
                return null;
            }
        } else if (segment === 'arg') {
            const idx = path[++i];
            if (current && isCall(current) && idx < current.a.length) {
                current = current.a[idx];
            } else {
                return null;
            }
        }
    }
    return current;
}

/**
 * Format a node for display (compact version)
 */
function formatNode(node, parser, maxLen = 80) {
    if (!node) return 'null';

    let str;
    if (parser && parser.nodeToString) {
        // Use nodeToString for more compact output
        str = parser.nodeToString(node);
    } else if (parser && parser.prettyPrint) {
        str = parser.prettyPrint(node, 0, true); // compact mode
    } else {
        str = JSON.stringify(node);
    }

    // Truncate if too long
    if (str.length > maxLen) {
        // Try to truncate at a reasonable boundary
        const truncated = str.substring(0, maxLen - 3);
        // Find the last complete token
        const lastSpace = truncated.lastIndexOf(' ');
        const lastParen = Math.max(truncated.lastIndexOf(')'), truncated.lastIndexOf('}'));
        const cutoff = Math.max(lastSpace > maxLen/2 ? lastSpace : 0, lastParen > maxLen/2 ? lastParen + 1 : 0);
        if (cutoff > 0) {
            return truncated.substring(0, cutoff) + '...';
        }
        return truncated + '...';
    }
    return str;
}

/**
 * Get a focused context diff showing only the changed parts with minimal context
 */
export function getFocusedDiff(before, after, parser) {
    // First, check if nodes are identical
    if (deq(before, after)) {
        return 'No changes';
    }

    // Convert to strings for analysis
    const beforeStr = parser ? parser.nodeToString(before) : JSON.stringify(before);
    const afterStr = parser ? parser.nodeToString(after) : JSON.stringify(after);

    // Calculate similarity ratio
    const maxLen = Math.max(beforeStr.length, afterStr.length);
    const minLen = Math.min(beforeStr.length, afterStr.length);
    const prefixLen = findCommonPrefixLength(beforeStr, afterStr);
    const suffixLen = findCommonSuffixLength(beforeStr, afterStr, prefixLen);
    const commonLen = prefixLen + suffixLen;
    const similarityRatio = maxLen > 0 ? commonLen / maxLen : 0;

    // Calculate the size of the actual change
    const changeSize = (beforeStr.length - commonLen) + (afterStr.length - commonLen);

    // Decision logic for using text diff vs structural diff:
    // 1. Very similar strings (>85%) with small changes (<50 chars changed) -> text diff
    // 2. Long strings (>100 chars) that are mostly the same (>70%) -> text diff
    // 3. Everything else -> structural diff
    const useTextDiff = (
        (similarityRatio > 0.85 && changeSize < 50) ||
        (similarityRatio > 0.70 && maxLen > 100) ||
        (similarityRatio > 0.90) // Always use text diff if >90% similar
    );

    if (useTextDiff && maxLen > 30) { // Don't use text diff for very short expressions
        const textDiff = getMinimalTextDiff(before, after, parser);
        const formatted = formatTextDiff(textDiff);
        if (formatted) {
            return formatted;
        }
    }

    // Otherwise, use structural diff
    const diff = diffNodes(before, after, 5); // Limit depth for performance

    if (diff.type === DiffType.UNCHANGED) {
        return 'No changes';
    }

    const formatted = formatDiff(diff, parser);
    return formatted || 'No visible changes';
}

// Helper functions for similarity calculation
function findCommonPrefixLength(str1, str2) {
    let i = 0;
    const minLen = Math.min(str1.length, str2.length);
    while (i < minLen && str1[i] === str2[i]) {
        i++;
    }
    return i;
}

function findCommonSuffixLength(str1, str2, prefixLen) {
    let i = 0;
    const len1 = str1.length;
    const len2 = str2.length;
    const minLen = Math.min(len1 - prefixLen, len2 - prefixLen);

    while (i < minLen && str1[len1 - 1 - i] === str2[len2 - 1 - i]) {
        i++;
    }
    return i;
}