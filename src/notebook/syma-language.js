// Monaco Editor language definition for Syma
export const symaLanguageConfig = {
    comments: {
        lineComment: ';',
        blockComment: ['#|', '|#']
    },
    brackets: [
        ['(', ')'],
        ['{', '}'],
        ['[', ']']
    ],
    autoClosingPairs: [
        { open: '(', close: ')' },
        { open: '{', close: '}' },
        { open: '[', close: ']' },
        { open: '"', close: '"' }
    ],
    surroundingPairs: [
        { open: '(', close: ')' },
        { open: '{', close: '}' },
        { open: '[', close: ']' },
        { open: '"', close: '"' }
    ]
};

export const symaMonarchTokens = {
    defaultToken: '',
    tokenPostfix: '.syma',

    keywords: [
        'Universe', 'Program', 'Rules', 'Module', 'Export', 'Import', 'Defs',
        'R', 'Apply', 'Effects', 'Flow', 'EffQueue', 'Inbox',
        'Lambda', 'Let', 'If', 'Match', 'Case', 'Quote', 'Unquote',
        'Var', 'VarRest', 'Project', 'true', 'false', 'nil'
    ],

    operators: [
        '+', '-', '*', '/', '%', '=', '!=', '<', '>', '<=', '>=',
        'and', 'or', 'not', '&', '|', '^', '~', '<<', '>>',
        'head', 'tail', 'cons', 'append'
    ],

    // Regular expressions
    symbols: /[=><!~?:&|+\-*\/\^%]+/,

    // The main tokenizer
    tokenizer: {
        root: [
            // Comments
            [/;.*$/, 'comment'],
            [/#\|/, 'comment', '@comment'],

            // Keywords
            [/[a-zA-Z_][\w-]*/, {
                cases: {
                    '@keywords': 'keyword',
                    '@operators': 'operator',
                    '@default': 'identifier'
                }
            }],

            // Module paths (e.g., Module/Name)
            [/[A-Z][\w]*\/[\w/]+/, 'type.identifier'],

            // Symbols/Identifiers starting with :
            [/:[\w-]+/, 'variable.parameter'],

            // Numbers
            [/-?\d*\.\d+([eE][\-+]?\d+)?/, 'number.float'],
            [/-?\d+/, 'number'],

            // Strings
            [/"([^"\\]|\\.)*"/, 'string'],

            // Delimiters and operators
            [/[(){}[\]]/, '@brackets'],
            [/@symbols/, {
                cases: {
                    '@operators': 'operator',
                    '@default': ''
                }
            }],

            // Whitespace
            { include: '@whitespace' }
        ],

        comment: [
            [/[^|#]+/, 'comment'],
            [/\|#/, 'comment', '@pop'],
            [/#\|/, 'comment', '@push'],
            [/[|#]/, 'comment']
        ],

        whitespace: [
            [/[ \t\r\n]+/, 'white']
        ]
    }
};

// Theme configuration for dark mode
export const symaTheme = {
    base: 'vs-dark',
    inherit: true,
    rules: [
        { token: 'keyword', foreground: 'C586C0' },
        { token: 'operator', foreground: 'D4D4D4' },
        { token: 'identifier', foreground: '9CDCFE' },
        { token: 'type.identifier', foreground: '4EC9B0' },
        { token: 'variable.parameter', foreground: 'DCDCAA' },
        { token: 'string', foreground: 'CE9178' },
        { token: 'number', foreground: 'B5CEA8' },
        { token: 'number.float', foreground: 'B5CEA8' },
        { token: 'comment', foreground: '6A9955', fontStyle: 'italic' },
    ],
    colors: {
        'editor.background': '#0a0a0a',
        'editor.foreground': '#D4D4D4',
        'editor.lineHighlightBackground': '#1a1a1a',
        'editorCursor.foreground': '#A7A7A7',
        'editorWhitespace.foreground': '#404040',
        'editor.selectionBackground': '#264F78',
        'editor.inactiveSelectionBackground': '#3A3D41'
    }
};

// Register language with Monaco
export function registerSymaLanguage(monaco) {
    // Register language
    monaco.languages.register({ id: 'syma' });

    // Set language configuration
    monaco.languages.setLanguageConfiguration('syma', symaLanguageConfig);

    // Set tokenizer
    monaco.languages.setMonarchTokensProvider('syma', symaMonarchTokens);

    // Define theme
    monaco.editor.defineTheme('syma-dark', symaTheme);
}

// Completion provider
export function registerCompletionProvider(monaco, getCompletions) {
    return monaco.languages.registerCompletionItemProvider('syma', {
        provideCompletionItems: async (model, position) => {
            const textUntilPosition = model.getValueInRange({
                startLineNumber: 1,
                startColumn: 1,
                endLineNumber: position.lineNumber,
                endColumn: position.column
            });

            // Call getCompletions asynchronously
            const suggestions = await getCompletions(textUntilPosition, textUntilPosition.length);

            // Get the word being completed
            const word = model.getWordUntilPosition(position);

            return {
                suggestions: (suggestions || []).map(item => ({
                    label: item,
                    kind: item.startsWith(':')
                        ? monaco.languages.CompletionItemKind.Function
                        : monaco.languages.CompletionItemKind.Keyword,
                    insertText: item,
                    range: {
                        startLineNumber: position.lineNumber,
                        endLineNumber: position.lineNumber,
                        startColumn: word.startColumn,
                        endColumn: position.column
                    }
                }))
            };
        }
    });
}