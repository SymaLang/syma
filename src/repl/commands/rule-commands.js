/*****************************************************************
 * Rule Management Commands
 *
 * Handles rule-related REPL commands:
 * - rules, rule, dropRule, editRule
 * - showRulesSection, showRuleRulesSection
 ******************************************************************/

import { isSym, isCall, isStr } from '../../ast-helpers.js';
import * as engine from '../../core/engine.js';

export class RuleCommands {
    constructor(repl) {
        this.repl = repl;
    }

    async listRules(args) {
        const rules = this.repl.getRules();
        if (rules.length === 0) {
            this.repl.platform.printWithNewline("No rules defined");
        } else {
            this.repl.platform.printWithNewline(`Rules (${rules.length}):`);
            for (const rule of rules) {
                const priority = rule.prio !== 0 ? ` [${rule.prio}]` : '';
                this.repl.platform.printWithNewline(`  ${rule.name}${priority}`);
            }
        }
        return true;
    }

    async showOrEditRule(args, rawArgs) {
        if (args.length === 0) {
            // Enter multiline rule definition mode
            this.repl.platform.printWithNewline("Enter rule definition (end with '.' on a new line):");
            this.repl.multilineMode = true;
            this.repl.multilineBuffer = [];

            // Override multiline completion handler
            const originalProcess = this.repl.processCompleteInput;
            this.repl.processCompleteInput = async (input) => {
                try {
                    const ruleAst = this.repl.parser.parseString(input);
                    this.repl.addRule(ruleAst);
                    this.repl.platform.printWithNewline("Rule added");
                } catch (error) {
                    this.repl.platform.printWithNewline(`Failed to parse rule: ${error.message}`);
                }
                this.repl.processCompleteInput = originalProcess;
                return true;
            };
            return true;
        }

        const name = args[0];

        // Check if this is an inline rule definition
        if (rawArgs.includes('→') || rawArgs.includes('->')) {
            try {
                // Strip the name from the beginning of rawArgs to get just the pattern and replacement
                const ruleText = rawArgs.slice(name.length).trim();
                const ruleAst = this.repl.parser.parseInlineRule(name, ruleText);
                this.repl.addRule(ruleAst);
                this.repl.platform.printWithNewline(`Rule "${name}" added`);
            } catch (error) {
                this.repl.platform.printWithNewline(`Failed to parse rule: ${error.message}`);
            }
            return true;
        }

        // Show specific rule
        const rules = this.repl.getRules();
        const rule = rules.find(r => r.name === name);
        if (rule) {
            // Format rule for display using pretty print
            const lhsStr = this.repl.prettyPrint ?
                this.repl.parser.prettyPrint(rule.lhs, 1) :
                this.repl.parser.nodeToString(rule.lhs);
            const rhsStr = this.repl.prettyPrint ?
                this.repl.parser.prettyPrint(rule.rhs, 1) :
                this.repl.parser.nodeToString(rule.rhs);
            const prioStr = rule.prio !== 0 ? `,\n  ${rule.prio}` : '';
            const guardStr = rule.guard ? `,\n  :guard ${this.repl.prettyPrint ?
                this.repl.parser.prettyPrint(rule.guard, 1) :
                this.repl.parser.nodeToString(rule.guard)}` : '';
            const output = `R("${rule.name}",\n  ${lhsStr},\n  ${rhsStr}${guardStr}${prioStr})`;
            this.repl.platform.printWithNewline(output);
        } else {
            this.repl.platform.printWithNewline(`Rule "${name}" not found`);
        }
        return true;
    }

    async dropRule(args) {
        if (args.length === 0) {
            this.repl.platform.printWithNewline("Usage: :drop <rule-name>");
            return true;
        }

        const name = args[0];
        const rules = this.repl.getRules();
        const exists = rules.some(r => r.name === name);

        if (exists) {
            this.repl.removeRule(name);
            this.repl.platform.printWithNewline(`Rule "${name}" removed`);
        } else {
            this.repl.platform.printWithNewline(`Rule "${name}" not found`);
        }
        return true;
    }

    async editRule(args, rawArgs) {
        if (args.length < 1) {
            this.repl.platform.printWithNewline("Usage: :edit <name> <pattern> → <replacement>");
            return true;
        }

        const name = args[0];
        const ruleText = rawArgs.slice(name.length).trim();

        if (!ruleText.includes('→') && !ruleText.includes('->')) {
            this.repl.platform.printWithNewline("Rule must contain → or ->");
            return true;
        }

        try {
            // Remove old rule if exists
            this.repl.removeRule(name);

            // Add new rule
            const ruleAst = this.repl.parser.parseInlineRule(name, ruleText);
            this.repl.addRule(ruleAst);
            this.repl.platform.printWithNewline(`Rule "${name}" updated`);
        } catch (error) {
            this.repl.platform.printWithNewline(`Failed to parse rule: ${error.message}`);
        }
        return true;
    }

    async showRulesSection(args) {
        const rulesSection = engine.findSection(this.repl.universe, "Rules");
        if (!rulesSection) {
            this.repl.platform.printWithNewline("No Rules section defined in the universe");
            return true;
        }

        this.repl.platform.printWithNewline("Rules Section:");
        const output = this.repl.formatResult(rulesSection);
        this.repl.platform.printWithNewline(output);
        return true;
    }

    async showRuleRulesSection(args) {
        const ruleRulesSection = engine.findSection(this.repl.universe, "RuleRules");
        if (!ruleRulesSection) {
            this.repl.platform.printWithNewline("No RuleRules section defined in the universe");
            return true;
        }

        this.repl.platform.printWithNewline("RuleRules Section:");
        const output = this.repl.formatResult(ruleRulesSection);
        this.repl.platform.printWithNewline(output);
        return true;
    }

    async showMacroScopes(args) {
        // Extract MacroScopes section from the universe
        const macroScopesNode = engine.findSection(this.repl.universe, "MacroScopes");

        if (!macroScopesNode || !isCall(macroScopesNode) || macroScopesNode.a.length === 0) {
            this.repl.platform.printWithNewline("No macro scopes defined (modules may not use 'macro' imports)");
            return true;
        }

        this.repl.platform.printWithNewline("Macro Scopes (which modules can use which RuleRules):\n");

        // Each entry is {Module "ModName" {RuleRulesFrom "Mod1" "Mod2" ...}}
        for (const entry of macroScopesNode.a) {
            if (!isCall(entry) || !isSym(entry.h) || entry.h.v !== "Module") continue;
            if (entry.a.length < 2 || !isStr(entry.a[0])) continue;

            const moduleName = entry.a[0].v;
            const ruleRulesFrom = entry.a[1];

            // Special formatting for global scope
            const displayName = moduleName === "*" ? "* (Global - applies to ALL modules)" : moduleName;

            if (!isCall(ruleRulesFrom) || !isSym(ruleRulesFrom.h) ||
                ruleRulesFrom.h.v !== "RuleRulesFrom") continue;

            // Collect the allowed RuleRule source modules
            const allowedModules = [];
            for (const mod of ruleRulesFrom.a) {
                if (isStr(mod)) {
                    allowedModules.push(mod.v);
                }
            }

            if (allowedModules.length > 0) {
                this.repl.platform.printWithNewline(`  ${displayName}:`);
                for (const allowed of allowedModules) {
                    this.repl.platform.printWithNewline(`    - Can use RuleRules from: ${allowed}`);
                }
            } else {
                this.repl.platform.printWithNewline(`  ${displayName}: No RuleRules in scope`);
            }
        }

        // Also show which modules have RuleRules defined
        const ruleRulesNode = engine.findSection(this.repl.universe, "RuleRules");
        if (ruleRulesNode && isCall(ruleRulesNode) && ruleRulesNode.a.length > 0) {
            this.repl.platform.printWithNewline("\nModules with RuleRules defined:");

            const modulesWithRuleRules = new Set();
            for (const taggedRuleRule of ruleRulesNode.a) {
                if (isCall(taggedRuleRule) && isSym(taggedRuleRule.h) &&
                    taggedRuleRule.h.v === "TaggedRuleRule") {
                    if (taggedRuleRule.a.length >= 2 && isStr(taggedRuleRule.a[0])) {
                        modulesWithRuleRules.add(taggedRuleRule.a[0].v);
                    }
                }
            }

            for (const mod of modulesWithRuleRules) {
                this.repl.platform.printWithNewline(`  - ${mod}`);
            }
        }

        return true;
    }
}