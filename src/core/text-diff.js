/*****************************************************************
 * Text-based Diff Utility
 *
 * Provides character-level diffing for nearly identical strings
 ******************************************************************/

/**
 * Find the longest common prefix between two strings
 */
function findCommonPrefix(str1, str2) {
    let i = 0;
    const minLen = Math.min(str1.length, str2.length);
    while (i < minLen && str1[i] === str2[i]) {
        i++;
    }
    return i;
}

/**
 * Find the longest common suffix between two strings
 */
function findCommonSuffix(str1, str2, prefixLen) {
    let i = 0;
    const len1 = str1.length;
    const len2 = str2.length;
    const minLen = Math.min(len1 - prefixLen, len2 - prefixLen);

    while (i < minLen &&
           str1[len1 - 1 - i] === str2[len2 - 1 - i]) {
        i++;
    }
    return i;
}

/**
 * Create a text diff showing minimal changes with context
 */
export function createTextDiff(before, after, contextChars = 20) {
    // If strings are identical, no diff
    if (before === after) {
        return null;
    }

    // If strings are completely different or very short, show full diff
    if (before.length < 30 && after.length < 30) {
        return {
            type: 'full',
            before,
            after
        };
    }

    // Find common prefix and suffix
    const prefixLen = findCommonPrefix(before, after);
    const suffixLen = findCommonSuffix(before, after, prefixLen);

    // If there's no common part, show full diff
    if (prefixLen === 0 && suffixLen === 0) {
        return {
            type: 'full',
            before,
            after
        };
    }

    // Extract the changed middle parts
    const beforeMiddle = before.substring(prefixLen, before.length - suffixLen);
    const afterMiddle = after.substring(prefixLen, after.length - suffixLen);

    // Get context around the change
    const contextStart = Math.max(0, prefixLen - contextChars);
    const contextEnd = Math.min(before.length, before.length - suffixLen + contextChars);
    const contextEndAfter = Math.min(after.length, after.length - suffixLen + contextChars);

    const prefix = before.substring(contextStart, prefixLen);
    const suffix = before.substring(before.length - suffixLen, contextEnd);
    const suffixAfter = after.substring(after.length - suffixLen, contextEndAfter);

    // Check if the change is small enough to show inline
    if (beforeMiddle.length <= 20 && afterMiddle.length <= 20) {
        return {
            type: 'inline',
            prefix: contextStart > 0 ? '...' + prefix : prefix,
            beforeMiddle,
            afterMiddle,
            suffix: contextEnd < before.length ? suffix + '...' : suffix,
            suffixAfter: contextEndAfter < after.length ? suffixAfter + '...' : suffixAfter
        };
    }

    // For larger changes, show with context
    return {
        type: 'context',
        prefix: contextStart > 0 ? '...' + prefix : prefix,
        beforeMiddle,
        afterMiddle,
        suffix: contextEnd < before.length ? suffix + '...' : suffix,
        suffixAfter: contextEndAfter < after.length ? suffixAfter + '...' : suffixAfter
    };
}

/**
 * Format a text diff for display
 */
export function formatTextDiff(diff, indent = 0) {
    const spaces = '  '.repeat(indent);

    if (!diff) return null;

    switch (diff.type) {
        case 'full':
            return `${spaces}- ${diff.before}\n${spaces}+ ${diff.after}`;

        case 'inline':
            // Show inline with highlighting
            if (diff.beforeMiddle === '' && diff.afterMiddle !== '') {
                // Insertion
                return `${spaces}${diff.prefix}[+${diff.afterMiddle}]${diff.suffix}`;
            } else if (diff.beforeMiddle !== '' && diff.afterMiddle === '') {
                // Deletion
                return `${spaces}${diff.prefix}[-${diff.beforeMiddle}]${diff.suffix}`;
            } else {
                // Replacement - show compact with arrow
                const lines = [];
                lines.push(`${spaces}${diff.prefix}[${diff.beforeMiddle} → ${diff.afterMiddle}]${diff.suffix}`);
                return lines.join('\n');
            }

        case 'context':
            // Show with context, changed parts highlighted
            const lines = [];
            if (diff.beforeMiddle.length < 30 && diff.afterMiddle.length < 30) {
                // Compact form with arrow
                lines.push(`${spaces}${diff.prefix}[${diff.beforeMiddle} → ${diff.afterMiddle}]${diff.suffix}`);
            } else {
                // Separate lines for longer changes
                lines.push(`${spaces}- ${diff.prefix}[${diff.beforeMiddle}]${diff.suffix}`);
                lines.push(`${spaces}+ ${diff.prefix}[${diff.afterMiddle}]${diff.suffixAfter}`);
            }
            return lines.join('\n');

        default:
            return null;
    }
}

/**
 * Get a minimal text diff between two nodes
 */
export function getMinimalTextDiff(beforeNode, afterNode, parser) {
    // Convert nodes to strings
    const beforeStr = parser ? parser.nodeToString(beforeNode) : JSON.stringify(beforeNode);
    const afterStr = parser ? parser.nodeToString(afterNode) : JSON.stringify(afterNode);

    // If strings are too long, truncate for performance
    const maxLen = 200;
    if (beforeStr.length > maxLen || afterStr.length > maxLen) {
        // Just show that they differ
        return {
            type: 'full',
            before: beforeStr.substring(0, maxLen) + '...',
            after: afterStr.substring(0, maxLen) + '...'
        };
    }

    return createTextDiff(beforeStr, afterStr);
}