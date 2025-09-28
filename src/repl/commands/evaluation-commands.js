/*****************************************************************
 * Evaluation and Execution Commands
 *
 * Handles evaluation-related REPL commands:
 * - applyRule, smartExecRule (exec)
 * - trace
 * - explainStuck (why)
 * - applyToState (apply)
 * - normalizeUniverse (norm)
 ******************************************************************/

import { isSym, isCall, deq } from '../../ast-helpers.js';
import * as engine from '../../core/engine.js';
import { foldPrims } from '../../primitives.js';

export class EvaluationCommands {
    constructor(repl) {
        this.repl = repl;
    }

    async applyRule(args, rawArgs) {
        if (args.length < 2) {
            this.repl.platform.printWithNewline("Usage: :apply <rule-name> <expression>");
            return true;
        }

        const ruleName = args[0];
        const exprText = args.slice(1).join(' ');

        try {
            const expr = this.repl.parser.parseString(exprText);
            const rules = this.repl.getRules();
            const rule = rules.find(r => r.name === ruleName);

            if (!rule) {
                this.repl.platform.printWithNewline(`Rule "${ruleName}" not found`);
                return true;
            }

            // Try to apply the specific rule
            const env = engine.match(rule.lhs, expr);
            if (env) {
                const result = engine.subst(rule.rhs, env);
                const output = this.repl.formatResult(result);
                this.repl.platform.printWithNewline(`→ ${output}`);
            } else {
                this.repl.platform.printWithNewline(`Rule "${ruleName}" does not match expression`);
            }
        } catch (error) {
            this.repl.platform.printWithNewline(`Error: ${error.message}`);
        }
        return true;
    }

    async smartExecRule(args, rawArgs) {
        if (args.length < 2) {
            this.repl.platform.printWithNewline("Usage: :exec <rule-name> <expression>");
            return true;
        }

        const ruleName = args[0];
        const exprText = args.slice(1).join(' ');

        try {
            const expr = this.repl.parser.parseString(exprText);
            const rules = this.repl.getRules();
            const rule = rules.find(r => r.name === ruleName);

            if (!rule) {
                this.repl.platform.printWithNewline(`Rule "${ruleName}" not found`);
                return true;
            }

            // Extract the pattern structure from the rule's LHS
            const wrappedExpr = this.wrapExpressionForRule(rule.lhs, expr);

            if (!wrappedExpr) {
                this.repl.platform.printWithNewline(`Cannot adapt expression to match rule pattern`);
                return true;
            }

            // Show what we're doing
            const patternStr = this.repl.formatResult(rule.lhs);
            const wrappedStr = this.repl.formatResult(wrappedExpr);
            this.repl.platform.printWithNewline(`Wrapping to match pattern: ${patternStr}`);
            this.repl.platform.printWithNewline(`Wrapped expression: ${wrappedStr}`);

            // Now just normalize the wrapped expression normally
            const normalized = engine.normalize(wrappedExpr, rules, this.repl.maxSteps, false, foldPrims);
            const output = this.repl.formatResult(normalized);
            this.repl.platform.printWithNewline(`→ ${output}`);
        } catch (error) {
            this.repl.platform.printWithNewline(`Error: ${error.message}`);
        }
        return true;
    }

    // Helper to wrap an expression to match a rule's pattern
    wrapExpressionForRule(pattern, expr) {
        // If pattern is a variable, just return the expr
        if (isSym(pattern) && pattern.v.endsWith('_')) {
            return expr;
        }

        // If pattern is a Call, we need to understand its structure
        if (isCall(pattern)) {
            // Check if this is a unary application pattern like {F x_}
            if (pattern.a.length === 1) {
                const arg = pattern.a[0];
                if (isSym(arg) && arg.v.endsWith('_')) {
                    // This is a pattern like {F x_}, wrap expr with F
                    return { k: 'Call', h: pattern.h, a: [expr] };
                }
            }
            // For more complex patterns, try to match the structure
            // This is a simplified approach - could be enhanced
            return { k: 'Call', h: pattern.h, a: [expr] };
        }

        // For other cases, return null to indicate we can't wrap
        return null;
    }

    async trace(args, rawArgs) {
        if (args.length === 0) {
            // Toggle trace mode
            this.repl.trace = !this.repl.trace;
            this.repl.platform.printWithNewline(`Trace mode: ${this.repl.trace ? 'on' : 'off'}`);
        } else if (args[0] === 'verbose') {
            // Handle verbose mode toggle or expression
            if (args.length === 1) {
                // Toggle verbose mode
                this.repl.traceVerbose = !this.repl.traceVerbose;
                this.repl.traceDiff = false; // Turn off diff mode when enabling verbose
                this.repl.platform.printWithNewline(`Verbose trace mode: ${this.repl.traceVerbose ? 'on' : 'off'}`);
            } else {
                // Evaluate expression with verbose trace
                const exprText = args.slice(1).join(' ');
                const oldTrace = this.repl.trace;
                const oldVerbose = this.repl.traceVerbose;
                const oldDiff = this.repl.traceDiff;
                this.repl.trace = true;
                this.repl.traceVerbose = true;
                this.repl.traceDiff = false;
                await this.repl.evaluateExpression(exprText);
                this.repl.trace = oldTrace;
                this.repl.traceVerbose = oldVerbose;
                this.repl.traceDiff = oldDiff;
            }
        } else if (args[0] === 'diff') {
            // Handle diff mode toggle or expression
            if (args.length === 1) {
                // Toggle diff mode
                this.repl.traceDiff = !this.repl.traceDiff;
                this.repl.traceVerbose = false; // Turn off verbose mode when enabling diff
                this.repl.platform.printWithNewline(`Diff trace mode: ${this.repl.traceDiff ? 'on' : 'off'}`);
            } else {
                // Evaluate expression with diff trace
                const exprText = args.slice(1).join(' ');
                const oldTrace = this.repl.trace;
                const oldVerbose = this.repl.traceVerbose;
                const oldDiff = this.repl.traceDiff;
                this.repl.trace = true;
                this.repl.traceVerbose = false;
                this.repl.traceDiff = true;
                await this.repl.evaluateExpression(exprText);
                this.repl.trace = oldTrace;
                this.repl.traceVerbose = oldVerbose;
                this.repl.traceDiff = oldDiff;
            }
        } else if (args[0] === 'stats') {
            // Show only statistics
            if (args.length === 1) {
                this.repl.platform.printWithNewline('Usage: :trace stats <expression>');
            } else {
                // Evaluate and show only stats
                const exprText = args.slice(1).join(' ');
                const oldTrace = this.repl.trace;
                this.repl.trace = true;
                this.repl.traceStatsOnly = true; // Special flag for stats-only mode
                await this.repl.evaluateExpression(exprText);
                this.repl.trace = oldTrace;
                this.repl.traceStatsOnly = false;
            }
        } else {
            // Evaluate expression with trace
            const exprText = args.join(' ');
            const oldTrace = this.repl.trace;
            const oldVerbose = this.repl.traceVerbose;
            const oldDiff = this.repl.traceDiff;
            this.repl.trace = true;
            this.repl.traceVerbose = false; // Default trace is non-verbose
            this.repl.traceDiff = false;
            await this.repl.evaluateExpression(exprText);
            this.repl.trace = oldTrace;
            this.repl.traceVerbose = oldVerbose;
            this.repl.traceDiff = oldDiff;
        }
        return true;
    }

    async explainStuck(args, rawArgs) {
        if (args.length === 0) {
            this.repl.platform.printWithNewline("Usage: :why <expression>");
            return true;
        }

        const exprText = args.join(' ');
        try {
            const expr = this.repl.parser.parseString(exprText);
            const rules = this.repl.getRules();

            this.repl.platform.printWithNewline("Checking why expression is stuck...\n");

            let foundCandidates = false;
            for (const rule of rules) {
                // Try partial matching to see how close we are
                const analysis = this.analyzeRuleMatch(rule, expr);
                if (analysis.partial) {
                    foundCandidates = true;
                    this.repl.platform.printWithNewline(`Rule "${rule.name}" partially matches:`);
                    const pattern = this.repl.prettyPrint ?
                        this.repl.parser.prettyPrint(rule.lhs, 1) :
                        this.repl.parser.nodeToString(rule.lhs);
                    this.repl.platform.printWithNewline(`  Pattern:\n    ${pattern}`);
                    this.repl.platform.printWithNewline(`  Issue: ${analysis.reason}`);
                    this.repl.platform.printWithNewline("");
                }
            }

            if (!foundCandidates) {
                this.repl.platform.printWithNewline("No rules come close to matching this expression");
            }
        } catch (error) {
            this.repl.platform.printWithNewline(`Error: ${error.message}`);
        }
        return true;
    }

    analyzeRuleMatch(rule, expr) {
        // Simple analysis - check if heads match at least
        const lhs = rule.lhs;

        if (isCall(lhs) && isCall(expr)) {
            if (deq(lhs.h, expr.h)) {
                // Heads match, check arguments
                if (lhs.a.length !== expr.a.length) {
                    return {
                        partial: true,
                        reason: `Argument count mismatch (expected ${lhs.a.length}, got ${expr.a.length})`
                    };
                }
                return {
                    partial: true,
                    reason: `Arguments don't match pattern`
                };
            }
        }

        return { partial: false };
    }

    async applyToState(args, rawArgs) {
        if (args.length === 0) {
            this.repl.platform.printWithNewline("Usage: :apply <action>");
            return true;
        }

        const actionText = args.join(' ');
        try {
            const action = this.repl.parser.parseString(actionText);

            // Try to find a matching rule to get the qualified name
            const rules = this.repl.getRules();
            let qualifiedAction = action;

            // If action is a simple symbol, try to find a rule that matches it
            if (isSym(action)) {
                const actionName = action.v;
                // Look for a rule that ends with this action name
                const matchingRule = rules.find(r => {
                    // Check if rule name ends with the action name
                    // e.g., "Demo/Counter/Inc" ends with "Inc"
                    return r.name.endsWith('/' + actionName) || r.name === actionName;
                });

                if (matchingRule) {
                    // Extract the action symbol from the rule's LHS pattern
                    // The pattern should be {Apply SomeQualifiedName ...}
                    const lhs = matchingRule.lhs;
                    if (isCall(lhs) && isSym(lhs.h) && lhs.h.v === 'Apply') {
                        if (lhs.a.length > 0 && isSym(lhs.a[0])) {
                            qualifiedAction = lhs.a[0];
                            this.repl.platform.printWithNewline(`Using qualified action: ${lhs.a[0].v}`);
                        }
                    }
                }
            }

            await this.repl.applyAction(qualifiedAction);

            // Show the updated program state
            const program = engine.getProgram(this.repl.universe);
            const output = this.repl.formatResult(program);
            this.repl.platform.printWithNewline('Program updated:');
            this.repl.platform.printWithNewline(output);
        } catch (error) {
            this.repl.platform.printWithNewline(`Error: ${error.message}`);
        }
        return true;
    }

    async normalizeUniverse(args) {
        try {
            // Save undo state
            this.repl.pushUndo();

            // Get the current Program section
            const program = engine.findSection(this.repl.universe, "Program");

            if (!program) {
                this.repl.platform.printWithNewline("No Program section to normalize");
                return true;
            }

            // Get current rules (indexed structure for engine functions)
            const rules = engine.extractRules(this.repl.universe);
            const flatRules = rules.allRules || [];

            if (flatRules.length === 0) {
                this.repl.platform.printWithNewline("No rules to apply");
                return true;
            }

            // Set flag to indicate we're in :norm command
            this.repl.inNormCommand = true;
            this.repl.normCommandTraces = []; // Clear any previous traces

            // Normalize the Program
            this.repl.platform.printWithNewline("Normalizing universe...");

            let normalized;
            let startTime, totalSteps = 0;

            // Start timing if trace is enabled
            if (this.repl.trace) {
                startTime = performance.now();
            }

            if (this.repl.trace) {
                const { result: normalizedResult, trace } = engine.normalizeWithTrace(
                    program,
                    rules,
                    this.repl.maxSteps,
                    false,
                    foldPrims
                );
                normalized = normalizedResult;
                totalSteps = trace.length;

                // Store the initial trace if it has steps
                if (trace.length > 0) {
                    this.repl.normCommandTraces.push({
                        label: 'Initial normalization',
                        trace: trace
                    });
                }
            } else {
                normalized = engine.normalize(program, rules, this.repl.maxSteps, false, foldPrims);
            }

            // Update the universe with the normalized Program
            if (!isCall(this.repl.universe)) {
                throw new Error("Invalid universe structure");
            }

            // Find and replace the Program section
            for (let i = 0; i < this.repl.universe.a.length; i++) {
                const section = this.repl.universe.a[i];
                if (isCall(section) && isSym(section.h) && section.h.v === "Program") {
                    this.repl.universe.a[i] = normalized;
                    break;
                }
            }

            this.repl.platform.printWithNewline("Universe normalized");

            // Optionally show the normalized program
            if (args.length > 0 && args[0] === 'show') {
                const output = this.repl.formatResult(normalized);
                this.repl.platform.printWithNewline("Normalized Program:");
                this.repl.platform.printWithNewline(output);
            }

            // Wait for any effects generated by normalization
            await this.repl.waitForEffects();

            // Calculate timing if trace is enabled (but don't show yet)
            let elapsedTime;
            if (this.repl.trace && startTime) {
                const endTime = performance.now();
                elapsedTime = endTime - startTime;

                // Count total steps including any effect-triggered normalizations
                if (this.repl.normCommandTraces.length > 0) {
                    totalSteps = this.repl.normCommandTraces.reduce((sum, { trace }) => sum + trace.length, 0);
                }
            }

            // Show all accumulated traces
            if (this.repl.trace && this.repl.normCommandTraces.length > 0) {
                // Combine all traces into a single continuous trace
                let allTraces = [];
                let stepOffset = 0;

                for (const { label, trace } of this.repl.normCommandTraces) {
                    if (trace.length > 0) {
                        // Adjust step numbers to be continuous
                        const adjustedTrace = trace.map((step, idx) => ({
                            ...step,
                            i: stepOffset + idx
                        }));
                        allTraces.push(...adjustedTrace);
                        stepOffset += trace.length;
                    }
                }

                // Show the combined trace
                await this.repl.showTrace(allTraces, rules);
            }

            // Show performance metrics after the trace (if trace is enabled)
            if (this.repl.trace && startTime && elapsedTime !== undefined) {
                // Output timing information
                this.repl.platform.printWithNewline(`\n=== Performance Metrics ===`);
                this.repl.platform.printWithNewline(`Total execution time: ${elapsedTime.toFixed(2)}ms`);
                this.repl.platform.printWithNewline(`Total rules in system: ${flatRules.length} rules`);
                this.repl.platform.printWithNewline(`Total rewrite steps: ${totalSteps} steps`);

                // Calculate average time per step if we have steps
                if (totalSteps > 0) {
                    const avgTimePerStep = elapsedTime / totalSteps;
                    this.repl.platform.printWithNewline(`Average time per step: ${avgTimePerStep.toFixed(3)}ms`);
                }
                this.repl.platform.printWithNewline(`===========================`);
            }
        } catch (error) {
            this.repl.platform.printWithNewline(`Normalization failed: ${error.message}\n`);
        } finally {
            // Clear the flag and traces
            this.repl.inNormCommand = false;
            this.repl.normCommandTraces = [];
        }
        return true;
    }
}