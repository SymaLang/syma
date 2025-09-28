/*****************************************************************
 * Pattern Matching Commands
 *
 * Handles pattern matching REPL commands:
 * - matchPattern (match, m)
 * - printMatchResults (helper)
 ******************************************************************/

import { isSym, isCall, isStr, deq } from '../../ast-helpers.js';
import * as engine from '../../core/engine.js';
import { foldPrims } from '../../primitives.js';

export class MatchCommands {
    constructor(repl) {
        this.repl = repl;
    }

    // Helper method to print match results
    printMatchResults(env, rewritePattern, normalizedInfo = null) {
        if (env) {
            // Check if we're in notebook mode
            const isNotebook = this.repl.platform.isNotebook === true;

            if (isNotebook && this.repl.platform.printStructured) {
                // In notebook mode, return structured output with collapsible sections
                const sections = [];

                // Success message (always shown as plain text)
                this.repl.platform.printWithNewline("Pattern matched successfully!");

                // Rewrite result (expanded by default, shown first)
                if (rewritePattern) {
                    const rewritten = engine.subst(rewritePattern, env);
                    const rewrittenStr = this.repl.formatResult(rewritten);
                    sections.push({
                        title: '✨ Rewrite Result',
                        content: rewrittenStr,
                        expanded: true,
                        className: 'rewrite-result'
                    });
                }

                // Normalization info (collapsed by default)
                if (normalizedInfo) {
                    const normContent = `From: ${this.repl.formatResult(normalizedInfo.original)}\nTo:   ${this.repl.formatResult(normalizedInfo.normalized)}`;
                    sections.push({
                        title: '🔄 Normalization',
                        content: normContent,
                        expanded: false,
                        className: 'normalization-info'
                    });
                }

                // Variable bindings (collapsed by default)
                const bindings = Object.keys(env).sort();
                if (bindings.length > 0) {
                    let bindingsContent = '';
                    for (const varName of bindings) {
                        const value = env[varName];
                        if (Array.isArray(value)) {
                            bindingsContent += `${varName}... = [\n`;
                            for (const item of value) {
                                const itemStr = this.repl.formatResult(item);
                                const indented = itemStr.split('\n').map(line => '  ' + line).join('\n');
                                bindingsContent += indented + '\n';
                            }
                            bindingsContent += ']\n\n';
                        } else {
                            const valueStr = this.repl.formatResult(value);
                            if (valueStr.includes('\n')) {
                                bindingsContent += `${varName}_ =\n`;
                                const indented = valueStr.split('\n').map(line => '  ' + line).join('\n');
                                bindingsContent += indented + '\n\n';
                            } else {
                                bindingsContent += `${varName}_ = ${valueStr}\n\n`;
                            }
                        }
                    }

                    sections.push({
                        title: `📎 Variable Bindings (${bindings.length})`,
                        content: bindingsContent.trim(),
                        expanded: false,
                        className: 'variable-bindings'
                    });
                }

                // Send ALL sections as a single accordion output
                if (sections.length > 0) {
                    this.repl.platform.printStructured({
                        type: 'accordion',
                        sections: sections
                    });
                } else {
                    // No special sections to show (shouldn't happen if match succeeded)
                    this.repl.platform.printWithNewline("(No additional details to show)");
                }

            } else {
                // Regular REPL mode - print everything as before
                this.repl.platform.printWithNewline("Pattern matched successfully!\n");

                // If rewritePattern is provided, show the result FIRST (this is what user cares about)
                if (rewritePattern) {
                    this.repl.platform.printWithNewline("Rewrite result:");
                    const rewritten = engine.subst(rewritePattern, env);
                    const rewrittenStr = this.repl.formatResult(rewritten);
                    this.repl.platform.printWithNewline(rewrittenStr);
                    this.repl.platform.printWithNewline("");
                }

                // If we normalized the target, show that info (as supporting detail)
                if (normalizedInfo) {
                    this.repl.platform.printWithNewline("Target was normalized:");
                    this.repl.platform.printWithNewline(`  From: ${this.repl.formatResult(normalizedInfo.original)}`);
                    this.repl.platform.printWithNewline(`  To:   ${this.repl.formatResult(normalizedInfo.normalized)}`);
                    this.repl.platform.printWithNewline("");
                }

                // Show all bindings (these are the details)
                const bindings = Object.keys(env).sort();
                if (bindings.length === 0) {
                    this.repl.platform.printWithNewline("No variable bindings (pattern matched exactly)");
                } else {
                    this.repl.platform.printWithNewline("Matched bindings:");
                    for (const varName of bindings) {
                        const value = env[varName];

                        // Handle VarRest bindings (arrays)
                        if (Array.isArray(value)) {
                            this.repl.platform.printWithNewline(`\n${varName}... = [`);
                            for (const item of value) {
                                const itemStr = this.repl.formatResult(item);
                                // Indent array items
                                const indented = itemStr.split('\\n').map(line => '  ' + line).join('\\n');
                                this.repl.platform.printWithNewline(indented);
                            }
                            this.repl.platform.printWithNewline(`]`);
                        } else {
                            // Regular variable binding
                            const valueStr = this.repl.formatResult(value);

                            // If the value is multiline, show it on the next line
                            if (valueStr.includes('\\n')) {
                                this.repl.platform.printWithNewline(`\n${varName}_ =`);
                                // Indent the value
                                const indented = valueStr.split('\\n').map(line => '  ' + line).join('\\n');
                                this.repl.platform.printWithNewline(indented);
                            } else {
                                this.repl.platform.printWithNewline(`\n${varName}_ = ${valueStr}`);
                            }
                        }
                    }
                }
            }
            return true;
        }
        return false;
    }

    async matchPattern(args, rawArgs) {
        // Check if entering multiline mode
        if (rawArgs.trim() === '') {
            // Enter multiline match mode
            this.repl.platform.printWithNewline("Enter multiline match (end with ':end'):");
            this.repl.platform.printWithNewline("  Pattern expression...");
            this.repl.platform.printWithNewline("  [:rewrite");
            this.repl.platform.printWithNewline("    Replacement expression...]");
            this.repl.platform.printWithNewline("  [:target or :norm or :universe");
            this.repl.platform.printWithNewline("    Target expression... (or :universe to match/rewrite the universe)]");
            this.repl.platform.printWithNewline("  :end");

            this.repl.multilineMode = true;
            this.repl.multilineBuffer = [];

            // Override multiline completion handler for match mode
            const originalProcess = this.repl.processCompleteInput;
            this.repl.processCompleteInput = async (input) => {
                // Check if this is the :end marker
                if (input.trim() === ':end') {
                    // Process the collected multiline match
                    this.repl.multilineMode = false;
                    const fullInput = this.repl.multilineBuffer.join('\n');
                    this.repl.multilineBuffer = [];
                    this.repl.processCompleteInput = originalProcess;

                    // Process as a match command with the collected input
                    return await this.matchPattern(['multiline'], fullInput);
                } else {
                    // Continue collecting lines
                    this.repl.multilineBuffer.push(input);
                    return true;
                }
            };
            return true;
        }

        if (args.length === 0 && rawArgs.trim() !== '') {
            // Show help if called with empty args but has rawArgs (shouldn't happen normally)
            args = ['help'];
        }

        if (args[0] === 'help') {
            this.repl.platform.printWithNewline("Usage: :match [<pattern> [:rewrite <replacement>] [:target/:norm/:universe <expression>]]");
            this.repl.platform.printWithNewline("\nMultiline mode:");
            this.repl.platform.printWithNewline("  :match                          - Enter multiline mode");
            this.repl.platform.printWithNewline("  {Complex Pattern}");
            this.repl.platform.printWithNewline("  :rewrite                        - Optional rewrite clause");
            this.repl.platform.printWithNewline("  {Complex Replacement}");
            this.repl.platform.printWithNewline("  :target                         - Target expression");
            this.repl.platform.printWithNewline("  {Complex Target}");
            this.repl.platform.printWithNewline("  :norm                           - Target expression (normalized)");
            this.repl.platform.printWithNewline("  {Expression to normalize}");
            this.repl.platform.printWithNewline("  :universe                       - Match/rewrite the universe itself");
            this.repl.platform.printWithNewline("  :end                            - End multiline input");
            this.repl.platform.printWithNewline("\nInline examples:");
            this.repl.platform.printWithNewline("  :match {Program p_}                    - Match against universe");
            this.repl.platform.printWithNewline("  :match {F x_ y_} :target {F 1 2}      - Match against expression");
            this.repl.platform.printWithNewline("  :match result_ :norm {+ 1 2}          - Match normalized expression");
            this.repl.platform.printWithNewline("  :match {F x_ y_} :rewrite {G y_ x_} :target {F 1 2}  - Rewrite with bindings");
            this.repl.platform.printWithNewline("  :match {Universe {Program p_} r...} :rewrite {Universe {Program {Modified p_}} r...} :universe");
            this.repl.platform.printWithNewline("                                         - Rewrite the universe structure");
            this.repl.platform.printWithNewline("\nPattern syntax:");
            this.repl.platform.printWithNewline("  x_    - Variable (matches any single expression)");
            this.repl.platform.printWithNewline("  x...  - Rest variable (matches zero or more expressions)");
            this.repl.platform.printWithNewline("  _     - Wildcard (matches anything without binding)");
            this.repl.platform.printWithNewline("\nNote: The :rewrite clause can be easily copied to create rules!");
            this.repl.platform.printWithNewline("      When matching against universe (no :target/:norm), automatically wraps in Universe[...]");
            return true;
        }

        try {
            // In multiline mode, rawArgs contains the full collected multiline input
            // We need to split it by section markers that appear at the start of lines
            if (args[0] === 'multiline') {
                // Split the multiline input by section markers
                const lines = rawArgs.split('\n');
                let currentSection = 'pattern';
                let sections = { pattern: [], rewrite: null, target: null, norm: null, universe: false };

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (trimmed === ':rewrite') {
                        currentSection = 'rewrite';
                        sections.rewrite = [];
                    } else if (trimmed === ':target') {
                        currentSection = 'target';
                        sections.target = [];
                    } else if (trimmed === ':norm') {
                        currentSection = 'norm';
                        sections.norm = [];
                    } else if (trimmed === ':universe') {
                        currentSection = 'universe';
                        sections.universe = true;
                    } else if (currentSection && currentSection !== 'universe' && sections[currentSection] !== null) {
                        sections[currentSection].push(line);
                    }
                }

                // Join each section and parse
                let pattern, target, rewritePattern = null, matchAgainstUniverse = true;
                let shouldNormalize = false;
                let rewriteUniverse = false;

                // Parse pattern (required)
                const patternText = sections.pattern.join('\n').trim();
                if (!patternText) {
                    this.repl.platform.printWithNewline("Error: Pattern is required");
                    return true;
                }
                pattern = this.repl.parser.parseString(patternText);

                // Parse rewrite if present
                if (sections.rewrite) {
                    const rewriteText = sections.rewrite.join('\n').trim();
                    if (!rewriteText) {
                        this.repl.platform.printWithNewline("Error: Rewrite replacement is required after :rewrite");
                        return true;
                    }
                    rewritePattern = this.repl.parser.parseString(rewriteText);
                }

                // Parse target or norm or universe if present
                if (sections.universe) {
                    // :universe mode - match/rewrite against a section of the universe
                    // Determine which section to target based on the pattern
                    if (isCall(pattern) && isSym(pattern.h)) {
                        const patternHead = pattern.h.v;

                        if (patternHead === 'Program') {
                            // Match against the Program section
                            target = engine.getProgram(this.repl.universe);
                        } else if (patternHead === 'Rules' || patternHead === 'RuleRules' || patternHead === 'MacroScopes') {
                            // Match against the specific section
                            const section = this.repl.universe.a.find(s =>
                                isCall(s) && isSym(s.h) && s.h.v === patternHead
                            );
                            target = section || { k: 'Call', h: { k: 'Sym', v: patternHead }, a: [] };
                        } else if (patternHead === 'Universe') {
                            // Match against the entire universe
                            target = this.repl.universe;
                        } else {
                            // Default: try matching against Program
                            target = engine.getProgram(this.repl.universe);
                        }
                    } else {
                        // Default: match against Program if pattern doesn't specify section
                        target = engine.getProgram(this.repl.universe);
                    }
                    matchAgainstUniverse = false;
                    rewriteUniverse = true;
                } else if (sections.target) {
                    const targetText = sections.target.join('\n').trim();
                    if (!targetText) {
                        this.repl.platform.printWithNewline("Error: Target expression is required after :target");
                        return true;
                    }
                    target = this.repl.parser.parseString(targetText);
                    matchAgainstUniverse = false;
                } else if (sections.norm) {
                    const targetText = sections.norm.join('\n').trim();
                    if (!targetText) {
                        this.repl.platform.printWithNewline("Error: Expression is required after :norm");
                        return true;
                    }
                    const targetExpr = this.repl.parser.parseString(targetText);

                    // Normalize the expression (but don't print yet - wait until after match)
                    const rules = engine.extractRules(this.repl.universe);
                    if (this.repl.trace) {
                        const { result: normalized, trace } = engine.normalizeWithTrace(
                            targetExpr,
                            rules,
                            this.repl.maxSteps,
                            false,
                            foldPrims
                        );
                        target = normalized;
                        if (trace.length > 0) {
                            this.repl.platform.printWithNewline(`Normalizing... applied ${trace.length} steps\n`);
                        }
                    } else {
                        target = engine.normalize(targetExpr, rules, this.repl.maxSteps, false, foldPrims);
                    }

                    matchAgainstUniverse = false;
                    shouldNormalize = { original: targetExpr, normalized: target };
                } else {
                    // No target/norm specified, match against universe
                    // Process pattern for universe matching
                    const fragments = [];
                    let depth = 0;
                    let start = 0;

                    for (let i = 0; i < patternText.length; i++) {
                        const char = patternText[i];
                        if (char === '{' || char === '(') depth++;
                        else if (char === '}' || char === ')') depth--;
                        else if (char === ' ' && depth === 0) {
                            const fragment = patternText.substring(start, i).trim();
                            if (fragment) fragments.push(fragment);
                            start = i + 1;
                        }
                    }
                    const lastFragment = patternText.substring(start).trim();
                    if (lastFragment) fragments.push(lastFragment);

                    const hasRestPattern = fragments.length > 0 &&
                                           fragments[fragments.length - 1].endsWith('...');

                    let needsPrefixRest = false;
                    if (fragments.length > 0) {
                        const firstFragment = fragments[0];
                        if (firstFragment.startsWith('{') && !firstFragment.startsWith('{Program')) {
                            needsPrefixRest = true;
                        }
                    }

                    const innerPattern = needsPrefixRest ?
                        `... ${fragments.join(' ')}` :
                        fragments.join(' ');

                    const fullPatternText = hasRestPattern ?
                        `{Universe ${innerPattern}}` :
                        `{Universe ${innerPattern} ...}`;
                    pattern = this.repl.parser.parseString(fullPatternText);
                    target = this.repl.universe;
                }

                // Now perform the match with the parsed sections
                const env = engine.match(pattern, target);

                // If we're rewriting the universe and the match succeeded
                if (rewriteUniverse && env && rewritePattern) {
                    return await this.performUniverseRewrite(pattern, rewritePattern, env);
                }

                // Use helper method to print results (pass normalization info if applicable)
                const normalizedInfo = (typeof shouldNormalize === 'object') ? shouldNormalize : null;
                if (this.printMatchResults(env, rewritePattern, normalizedInfo)) {
                    // Match succeeded, results printed
                } else {
                    this.printMatchFailure(pattern, target, normalizedInfo, matchAgainstUniverse);
                }

                return true;
            }

            // Regular (non-multiline) mode processing
            // Check for all possible markers and their positions
            const targetMarker = ':target';
            const normMarker = ':norm';
            const rewriteMarker = ':rewrite';
            const universeMarker = ':universe';
            const targetIndex = rawArgs.indexOf(targetMarker);
            const normIndex = rawArgs.indexOf(normMarker);
            const rewriteIndex = rawArgs.indexOf(rewriteMarker);
            const universeIndex = rawArgs.indexOf(universeMarker);

            let pattern, target, rewritePattern = null, matchAgainstUniverse = true;
            let shouldNormalize = false;
            let rewriteUniverse = false;

            // Parse the pattern first - it's always at the beginning
            let patternEndPos = rawArgs.length;
            if (rewriteIndex !== -1) patternEndPos = Math.min(patternEndPos, rewriteIndex);
            if (targetIndex !== -1) patternEndPos = Math.min(patternEndPos, targetIndex);
            if (normIndex !== -1) patternEndPos = Math.min(patternEndPos, normIndex);
            if (universeIndex !== -1) patternEndPos = Math.min(patternEndPos, universeIndex);

            const patternText = rawArgs.substring(0, patternEndPos).trim();
            if (!patternText) {
                this.repl.platform.printWithNewline("Error: Pattern is required");
                return true;
            }

            // Check if we have a :rewrite clause and extract it
            if (rewriteIndex !== -1) {
                let rewriteEndPos = rawArgs.length;
                if (targetIndex > rewriteIndex) rewriteEndPos = targetIndex;
                if (normIndex > rewriteIndex) rewriteEndPos = Math.min(rewriteEndPos, normIndex);
                if (universeIndex > rewriteIndex) rewriteEndPos = Math.min(rewriteEndPos, universeIndex);

                const rewriteText = rawArgs.substring(rewriteIndex + rewriteMarker.length, rewriteEndPos).trim();
                if (!rewriteText) {
                    this.repl.platform.printWithNewline("Error: Rewrite replacement is required after :rewrite");
                    return true;
                }
                rewritePattern = this.repl.parser.parseString(rewriteText);
            }

            if (universeIndex !== -1) {
                // :universe mode - match/rewrite against a section of the universe
                pattern = this.repl.parser.parseString(patternText);

                // Determine which section to target based on the pattern
                if (isCall(pattern) && isSym(pattern.h)) {
                    const patternHead = pattern.h.v;

                    if (patternHead === 'Program') {
                        // Match against the Program section
                        target = engine.getProgram(this.repl.universe);
                    } else if (patternHead === 'Rules' || patternHead === 'RuleRules' || patternHead === 'MacroScopes') {
                        // Match against the specific section
                        const section = this.repl.universe.a.find(s =>
                            isCall(s) && isSym(s.h) && s.h.v === patternHead
                        );
                        target = section || { k: 'Call', h: { k: 'Sym', v: patternHead }, a: [] };
                    } else if (patternHead === 'Universe') {
                        // Match against the entire universe
                        target = this.repl.universe;
                    } else {
                        // Default: try matching against Program
                        target = engine.getProgram(this.repl.universe);
                    }
                } else {
                    // Default: match against Program if pattern doesn't specify section
                    target = engine.getProgram(this.repl.universe);
                }

                matchAgainstUniverse = false; // We're explicitly targeting a section
                rewriteUniverse = true; // Flag to indicate we should update universe with rewrite result
            } else if (targetIndex !== -1 && (normIndex === -1 || targetIndex < normIndex)) {
                // :target mode - use expression as-is
                const targetText = rawArgs.substring(targetIndex + targetMarker.length).trim();

                if (!targetText) {
                    this.repl.platform.printWithNewline("Error: Target expression is required after :target");
                    return true;
                }

                // Parse pattern and target
                pattern = this.repl.parser.parseString(patternText);
                target = this.repl.parser.parseString(targetText);
                matchAgainstUniverse = false;
            } else if (normIndex !== -1) {
                // :norm mode - normalize expression before matching
                const targetText = rawArgs.substring(normIndex + normMarker.length).trim();

                if (!targetText) {
                    this.repl.platform.printWithNewline("Error: Target expression is required after :norm");
                    return true;
                }

                // Parse pattern and target
                pattern = this.repl.parser.parseString(patternText);
                const targetExpr = this.repl.parser.parseString(targetText);

                // Normalize the target expression using current rules (but don't display yet)
                const rules = engine.extractRules(this.repl.universe);

                if (this.repl.trace) {
                    // If trace is on, show minimal normalization info
                    const { result: normalized, trace } = engine.normalizeWithTrace(
                        targetExpr,
                        rules,
                        this.repl.maxSteps,
                        false,
                        foldPrims
                    );
                    target = normalized;

                    if (trace.length > 0) {
                        this.repl.platform.printWithNewline(`Normalizing... applied ${trace.length} steps\n`);
                    }
                } else {
                    target = engine.normalize(targetExpr, rules, this.repl.maxSteps, false, foldPrims);
                }

                matchAgainstUniverse = false;
                shouldNormalize = { original: targetExpr, normalized: target };
            } else {
                // No :target or :norm, match against universe (existing behavior)
                // Parse as multiple expressions (space-separated patterns inside Universe)
                const fragments = [];
                let depth = 0;
                let start = 0;

                // Simple parser to split on spaces at depth 0
                for (let i = 0; i < patternText.length; i++) {
                    const char = patternText[i];
                    if (char === '{' || char === '(') depth++;
                    else if (char === '}' || char === ')') depth--;
                    else if (char === ' ' && depth === 0) {
                        const fragment = patternText.substring(start, i).trim();
                        if (fragment) fragments.push(fragment);
                        start = i + 1;
                    }
                }
                // Add the last fragment
                const lastFragment = patternText.substring(start).trim();
                if (lastFragment) fragments.push(lastFragment);

                // Check if the last fragment is already a rest pattern (ends with ...)
                const hasRestPattern = fragments.length > 0 &&
                                       fragments[fragments.length - 1].endsWith('...');

                // Check if the first fragment is NOT Program and doesn't start with underscore/variable
                let needsPrefixRest = false;
                if (fragments.length > 0) {
                    const firstFragment = fragments[0];
                    // Check if it's a Call pattern that doesn't start with Program
                    if (firstFragment.startsWith('{') && !firstFragment.startsWith('{Program')) {
                        needsPrefixRest = true;
                    }
                }

                // Build the full Universe pattern
                const innerPattern = needsPrefixRest ?
                    `... ${fragments.join(' ')}` :
                    fragments.join(' ');

                // If user didn't specify a rest pattern at the end, add ... to match remaining sections
                const fullPatternText = hasRestPattern ?
                    `{Universe ${innerPattern}}` :
                    `{Universe ${innerPattern} ...}`;
                pattern = this.repl.parser.parseString(fullPatternText);
                target = this.repl.universe;
            }

            // Perform the match
            const env = engine.match(pattern, target);

            // If we're rewriting the universe and the match succeeded
            if (rewriteUniverse && env && rewritePattern) {
                return await this.performUniverseRewrite(pattern, rewritePattern, env);
            }

            // Use helper method to print results (pass normalization info if applicable)
            const normalizedInfo = (typeof shouldNormalize === 'object') ? shouldNormalize : null;
            if (!this.printMatchResults(env, rewritePattern, normalizedInfo)) {
                this.printMatchFailure(pattern, target, normalizedInfo, matchAgainstUniverse);
            }
        } catch (error) {
            this.repl.platform.printWithNewline(`Error: ${error.message}`);
        }
        return true;
    }

    async performUniverseRewrite(pattern, rewritePattern, env) {
        // Save undo state
        this.repl.pushUndo();

        // Apply the rewrite
        const rewritten = engine.subst(rewritePattern, env);

        // Determine which section we matched against based on the pattern
        let matchedSection = 'Program'; // Default
        if (isCall(pattern) && isSym(pattern.h)) {
            matchedSection = pattern.h.v;
        }

        // Now update the appropriate section with the rewritten result
        if (matchedSection === 'Program') {
            // When matching against Program, the rewrite result IS the new program content
            // We need to preserve the Program wrapper
            const currentProgram = engine.getProgram(this.repl.universe);
            if (isCall(rewritten) && isSym(rewritten.h) && rewritten.h.v === 'Program') {
                // If rewrite produced a full Program node, use it directly
                this.repl.universe = engine.setProgram(this.repl.universe, rewritten);
            } else {
                // Otherwise, wrap the result as the new Program content
                // Preserve EffQueue and Effects from the original program
                const effQueue = currentProgram.a.find(n => isCall(n) && isSym(n.h) && n.h.v === 'EffQueue');
                const effects = currentProgram.a.find(n => isCall(n) && isSym(n.h) && n.h.v === 'Effects');
                const newProgram = {
                    k: 'Call',
                    h: { k: 'Sym', v: 'Program' },
                    a: [
                        effQueue || { k: 'Call', h: { k: 'Sym', v: 'EffQueue' }, a: [] },
                        effects || { k: 'Call', h: { k: 'Sym', v: 'Effects' }, a: [
                            { k: 'Call', h: { k: 'Sym', v: 'Pending' }, a: [] },
                            { k: 'Call', h: { k: 'Sym', v: 'Inbox' }, a: [] }
                        ]},
                        rewritten
                    ]
                };
                this.repl.universe = engine.setProgram(this.repl.universe, newProgram);
            }
        } else if (matchedSection === 'Rules' || matchedSection === 'RuleRules' || matchedSection === 'MacroScopes') {
            // For other sections, replace them directly
            const universeIndex = this.repl.universe.a.findIndex(n =>
                isCall(n) && isSym(n.h) && n.h.v === matchedSection
            );
            if (universeIndex !== -1) {
                // Check if rewrite produced a full section node
                if (isCall(rewritten) && isSym(rewritten.h) && rewritten.h.v === matchedSection) {
                    this.repl.universe.a[universeIndex] = rewritten;
                } else {
                    // Wrap the result in the section
                    this.repl.universe.a[universeIndex] = {
                        k: 'Call',
                        h: { k: 'Sym', v: matchedSection },
                        a: Array.isArray(rewritten.a) ? rewritten.a : [rewritten]
                    };
                }
            } else {
                // Add new section
                if (isCall(rewritten) && isSym(rewritten.h) && rewritten.h.v === matchedSection) {
                    this.repl.universe.a.push(rewritten);
                } else {
                    this.repl.universe.a.push({
                        k: 'Call',
                        h: { k: 'Sym', v: matchedSection },
                        a: Array.isArray(rewritten.a) ? rewritten.a : [rewritten]
                    });
                }
            }
        } else if (matchedSection === 'Universe') {
            // If we matched the entire universe, replace it entirely
            if (isCall(rewritten) && isSym(rewritten.h) && rewritten.h.v === 'Universe') {
                this.repl.universe = rewritten;
            } else {
                // This shouldn't happen, but handle it gracefully
                this.repl.platform.printWithNewline("Error: Rewrite result is not a valid Universe");
            }
        } else {
            // Unknown section - try to handle gracefully
            this.repl.platform.printWithNewline(`Warning: Unknown section type: ${matchedSection}`);
        }

        // Apply RuleRules to transform the Universe permanently
        this.repl.universe = engine.applyRuleRules(this.repl.universe, foldPrims);

        this.repl.platform.printWithNewline("Universe successfully rewritten!");
        this.repl.platform.printWithNewline("\nNew universe:");
        const output = this.repl.formatResult(this.repl.universe);
        this.repl.platform.printWithNewline(output);
        return true;
    }

    printMatchFailure(pattern, target, normalizedInfo, matchAgainstUniverse) {
        this.repl.platform.printWithNewline("Pattern did not match");

        // If we normalized, show what we tried to match against
        if (normalizedInfo) {
            this.repl.platform.printWithNewline("\nTarget was normalized:");
            this.repl.platform.printWithNewline(`  From: ${this.repl.formatResult(normalizedInfo.original)}`);
            this.repl.platform.printWithNewline(`  To:   ${this.repl.formatResult(normalizedInfo.normalized)}`);
        }

        // Provide helpful hints based on the matching context
        if (matchAgainstUniverse) {
            // When matching against universe, check the inner patterns
            if (isCall(pattern) && pattern.a.length > 0) {
                const universeSections = [];
                for (const section of this.repl.universe.a) {
                    if (isCall(section) && isSym(section.h)) {
                        universeSections.push(section.h.v);
                    }
                }
                if (universeSections.length > 0) {
                    this.repl.platform.printWithNewline(`\nAvailable sections in universe: ${universeSections.join(', ')}`);
                }

                // Check if the user is trying to match a non-existent section
                const firstPattern = pattern.a[0];
                if (isCall(firstPattern) && isSym(firstPattern.h)) {
                    const sectionName = firstPattern.h.v;
                    if (!universeSections.includes(sectionName)) {
                        this.repl.platform.printWithNewline(`\nHint: Section "${sectionName}" not found in universe`);
                    }
                }
            }
        } else {
            this.repl.platform.printWithNewline("\nPattern structure:");
            const patternStr = this.repl.formatResult(pattern);
            this.repl.platform.printWithNewline(patternStr);

            this.repl.platform.printWithNewline("\nTarget structure:");
            const targetStr = this.repl.formatResult(target);
            this.repl.platform.printWithNewline(targetStr);

            // Basic structure comparison
            if (isCall(pattern) && !isCall(target)) {
                this.repl.platform.printWithNewline("\nHint: Pattern expects a Call expression but target is not");
            } else if (isCall(pattern) && isCall(target)) {
                if (!deq(pattern.h, target.h)) {
                    const patternHead = isSym(pattern.h) ? pattern.h.v : this.repl.formatResult(pattern.h);
                    const targetHead = isSym(target.h) ? target.h.v : this.repl.formatResult(target.h);
                    this.repl.platform.printWithNewline(`\nHint: Heads don't match - pattern has "${patternHead}", target has "${targetHead}"`);
                } else if (pattern.a.length !== target.a.length) {
                    // Check if pattern uses rest variables
                    const hasRest = pattern.a.some(arg => isSym(arg) && arg.v.endsWith('...'));
                    if (!hasRest) {
                        this.repl.platform.printWithNewline(`\nHint: Argument count mismatch - pattern expects ${pattern.a.length}, target has ${target.a.length}`);
                    }
                }
            }
        }
    }
}