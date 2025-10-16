/*****************************************************************
 * Debug Utilities
 *
 * Shared utility functions for debug overlay components
 ******************************************************************/

/**
 * Fuzzy match a pattern against a string
 * @param {string} str - String to search in
 * @param {string} pattern - Pattern to match
 * @returns {boolean} Whether the pattern fuzzy matches the string
 */
export function fuzzyMatch(str, pattern) {
    const patternLower = pattern.toLowerCase();
    const strLower = str.toLowerCase();
    let patternIdx = 0;
    for (let i = 0; i < strLower.length && patternIdx < patternLower.length; i++) {
        if (strLower[i] === patternLower[patternIdx]) {
            patternIdx++;
        }
    }
    return patternIdx === patternLower.length;
}

/**
 * Highlight matching characters in text with HTML spans
 * @param {string} text - Text to highlight
 * @param {string} searchTerm - Term to highlight
 * @returns {string} HTML string with highlighted matches
 */
export function highlightMatches(text, searchTerm) {
    if (!searchTerm) return text;

    const result = [];
    const textLower = text.toLowerCase();
    const searchLower = searchTerm.toLowerCase();
    let lastIndex = 0;
    let searchIndex = 0;

    for (let i = 0; i < text.length && searchIndex < searchLower.length; i++) {
        if (textLower[i] === searchLower[searchIndex]) {
            if (i > lastIndex) {
                result.push(text.substring(lastIndex, i));
            }
            result.push(`<span style="background: rgba(88, 166, 255, 0.3); color: #58a6ff;">${text[i]}</span>`);
            lastIndex = i + 1;
            searchIndex++;
        }
    }

    if (lastIndex < text.length) {
        result.push(text.substring(lastIndex));
    }

    return result.join('');
}
