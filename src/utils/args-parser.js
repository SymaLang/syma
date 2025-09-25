/*****************************************************************
 * Command-line Arguments Parser
 *
 * Parses command-line style arguments into KV AST nodes for
 * injection into Syma programs' {Args} section
 ******************************************************************/

/**
 * Parse program arguments into KV AST nodes
 * @param {string[]} args - Array of command-line style arguments
 * @returns {Array} - Array of KV AST nodes
 */
export function parseProgramArgsToKV(args) {
    const kvNodes = [];

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if (arg.startsWith('--')) {
            // It's a key
            const key = arg.substring(2); // Remove --

            // Check if next arg is a value (doesn't start with --)
            let value;
            if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
                value = { k: 'Str', v: args[++i] };
            } else {
                // No value, use Empty
                value = { k: 'Sym', v: 'Empty' };
            }

            // Create KV node: {KV "key" value}
            kvNodes.push({
                k: 'Call',
                h: { k: 'Sym', v: 'KV' },
                a: [
                    { k: 'Str', v: key },
                    value
                ]
            });
        } else if (arg.startsWith('-') && arg.length > 1 && arg[1] !== '-') {
            // Single dash flag (like -i, -o)
            const key = arg.substring(1);

            // Check if next arg is a value
            let value;
            if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
                value = { k: 'Str', v: args[++i] };
            } else {
                value = { k: 'Sym', v: 'Empty' };
            }

            kvNodes.push({
                k: 'Call',
                h: { k: 'Sym', v: 'KV' },
                a: [
                    { k: 'Str', v: key },
                    value
                ]
            });
        } else {
            // Positional argument - store with numeric key
            kvNodes.push({
                k: 'Call',
                h: { k: 'Sym', v: 'KV' },
                a: [
                    { k: 'Num', v: kvNodes.filter(n => n.a[0].k === 'Num').length },
                    { k: 'Str', v: arg }
                ]
            });
        }
    }

    return kvNodes;
}

/**
 * Parse an :args string into an array of arguments
 * Handles quoted strings and preserves spaces within quotes
 * @param {string} argsString - The arguments string after :args
 * @returns {string[]} - Array of parsed arguments
 */
export function parseArgsString(argsString) {
    const args = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = null;

    for (let i = 0; i < argsString.length; i++) {
        const char = argsString[i];

        if ((char === '"' || char === "'") && !inQuotes) {
            // Starting a quoted string
            inQuotes = true;
            quoteChar = char;
        } else if (char === quoteChar && inQuotes) {
            // Ending a quoted string
            inQuotes = false;
            quoteChar = null;
        } else if (char === ' ' && !inQuotes) {
            // Space outside quotes - end current argument
            if (current.length > 0) {
                args.push(current);
                current = '';
            }
        } else {
            // Regular character
            current += char;
        }
    }

    // Add the last argument if any
    if (current.length > 0) {
        args.push(current);
    }

    return args;
}