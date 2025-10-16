/*****************************************************************
 * Syntax Highlighter for Syma Code
 *
 * Lightweight tokenizer and highlighter based on Syma grammar
 ******************************************************************/

// Color scheme inspired by GitHub Dark theme
const COLORS = {
    comment: '#8b949e',
    string: '#a5d6ff',
    number: '#79c0ff',
    keyword: '#ff7b72',
    builtin: '#d2a8ff',
    function: '#d2a8ff',
    operator: '#ff7b72',
    variable: '#ffa657',
    varPattern: '#7ee787',
    attribute: '#79c0ff',
    constant: '#79c0ff',
    symbol: '#ffa657',
    punctuation: '#c9d1d9'
};

// Token patterns based on syma.tmLanguage.json
const PATTERNS = [
    // Comments
    { regex: /;[^\n]*/, type: 'comment' },
    { regex: /\/\/[^\n]*/, type: 'comment' },
    { regex: /\/\*[\s\S]*?\*\//, type: 'comment' },

    // Strings
    { regex: /"(?:[^"\\]|\\.)*"/, type: 'string' },

    // Numbers
    { regex: /-?\d+\.\d+/, type: 'number' },
    { regex: /-?\d+/, type: 'number' },

    // Variable patterns (patterns with underscore)
    { regex: /\b[a-zA-Z][a-zA-Z0-9]*\.\.\./, type: 'varPattern' },
    { regex: /\b[a-zA-Z][a-zA-Z0-9]*___/, type: 'varPattern' },
    { regex: /\.\.\./, type: 'varPattern' },
    { regex: /___/, type: 'varPattern' },
    { regex: /\b[a-zA-Z][a-zA-Z0-9]*_(?!_)/, type: 'varPattern' },
    { regex: /\b_\b/, type: 'varPattern' },

    // Keywords - module system
    { regex: /\b(?:Module|Export|Import|as|open|Defs|Program|Rules|RuleRules|Universe)\b/, type: 'keyword' },

    // Keywords - control flow
    { regex: /\b(?:If|When|Cond|Match|Case)\b/, type: 'keyword' },
    { regex: /\b(?:Apply|Project|Bundle|Seq)\b/, type: 'keyword' },

    // Special keywords
    { regex: /\b(?:R|Def|Var|VarRest)\b/, type: 'keyword' },

    // Constants
    { regex: /\b(?:True|False|Nil)\b/, type: 'constant' },

    // Built-in functions
    { regex: /\b(?:Add|Sub|Mul|Div|Mod|Pow|Sqrt|Abs|Min|Max|Floor|Ceil|Round)\b/, type: 'builtin' },
    { regex: /\b(?:Concat|ToString|ToUpper|ToLower|Trim|StrLen|Substring|IndexOf|Replace)\b/, type: 'builtin' },
    { regex: /\b(?:Eq|Neq|Lt|Gt|Lte|Gte)\b/, type: 'builtin' },
    { regex: /\b(?:And|Or|Not)\b/, type: 'builtin' },
    { regex: /\b(?:IsNum|IsStr|IsSym|IsTrue|IsFalse)\b/, type: 'builtin' },
    { regex: /\b(?:Timer|HttpReq|WsConnect|StorageGet|StorageSet|Print|FreshId|Random|Debug)\b/, type: 'builtin' },
    { regex: /\b(?:Div|Span|Button|Input|Form|H[1-6]|P|A|Img|UI|Show|State|App|Effects|Pending|Inbox)\b/, type: 'builtin' },

    // Operators
    { regex: /\/@/, type: 'operator' },
    { regex: /→|->|=>|<-/, type: 'operator' },
    { regex: /[<>=!]+/, type: 'operator' },
    { regex: /[+\-*\/%^]/, type: 'operator' },

    // Attributes (keywords starting with colon)
    { regex: /:[a-zA-Z_][a-zA-Z0-9_-]*/, type: 'attribute' },

    // Function calls and symbols
    { regex: /\b[A-Z][a-zA-Z0-9_/]*\b/, type: 'function' },
    { regex: /\b[a-z][a-zA-Z0-9_/]*\b/, type: 'symbol' },

    // Punctuation
    { regex: /[{}()\[\],]/, type: 'punctuation' }
];

/**
 * Tokenize Syma code into an array of tokens
 * @param {string} code - Code to tokenize
 * @returns {Array} Array of {type, value, start, end} tokens
 */
export function tokenize(code) {
    const tokens = [];
    let pos = 0;

    while (pos < code.length) {
        // Skip whitespace but preserve it
        if (/\s/.test(code[pos])) {
            const start = pos;
            while (pos < code.length && /\s/.test(code[pos])) {
                pos++;
            }
            tokens.push({
                type: 'whitespace',
                value: code.substring(start, pos),
                start,
                end: pos
            });
            continue;
        }

        // Try to match a pattern
        let matched = false;
        for (const pattern of PATTERNS) {
            const match = code.substring(pos).match(pattern.regex);
            if (match && match.index === 0) {
                tokens.push({
                    type: pattern.type,
                    value: match[0],
                    start: pos,
                    end: pos + match[0].length
                });
                pos += match[0].length;
                matched = true;
                break;
            }
        }

        // If no pattern matched, consume one character as text
        if (!matched) {
            tokens.push({
                type: 'text',
                value: code[pos],
                start: pos,
                end: pos + 1
            });
            pos++;
        }
    }

    return tokens;
}

/**
 * Highlight Syma code with syntax coloring
 * @param {string} code - Code to highlight
 * @returns {string} HTML string with colored spans
 */
export function highlight(code) {
    const tokens = tokenize(code);
    const parts = [];

    for (const token of tokens) {
        if (token.type === 'whitespace') {
            // Preserve whitespace as-is
            parts.push(escapeHtml(token.value));
        } else if (token.type === 'text') {
            // Unmatched text
            parts.push(`<span style="color: ${COLORS.symbol}">${escapeHtml(token.value)}</span>`);
        } else {
            // Apply color based on token type
            const color = COLORS[token.type] || COLORS.symbol;
            parts.push(`<span style="color: ${color}">${escapeHtml(token.value)}</span>`);
        }
    }

    return parts.join('');
}

/**
 * Create a highlighted code element
 * @param {string} code - Code to highlight
 * @param {Object} style - Additional CSS styles
 * @returns {HTMLElement} Pre element with highlighted code
 */
export function createHighlightedCodeElement(code, style = {}) {
    const pre = document.createElement('pre');

    const baseStyle = {
        margin: '0',
        whiteSpace: 'pre-wrap',
        wordWrap: 'break-word',
        lineHeight: '1.4',
        fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace",
        fontSize: '11px',
        ...style
    };

    pre.style.cssText = Object.entries(baseStyle)
        .map(([key, value]) => {
            const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
            return `${cssKey}: ${value}`;
        })
        .join('; ');

    pre.innerHTML = highlight(code);
    return pre;
}

/**
 * Escape HTML special characters
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Get color for a specific token type (useful for custom rendering)
 * @param {string} type - Token type
 * @returns {string} CSS color value
 */
export function getColorForType(type) {
    return COLORS[type] || COLORS.symbol;
}
