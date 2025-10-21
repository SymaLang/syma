/*****************************************************************
 * Rules Section Component
 *
 * Searchable, collapsible accordion for displaying rules
 ******************************************************************/

import { extractRules } from '@syma/core/engine';
import { fuzzyMatch, highlightMatches } from './utils.js';
import { createHighlightedCodeElement } from './syntax-highlighter.js';

export class RulesSection {
    constructor(parser, getUniverse) {
        this.parser = parser;
        this.getUniverse = getUniverse;
        this.searchTerm = '';
        this.expandedRules = new Set();
    }

    render() {
        const universe = this.getUniverse();
        if (!universe) {
            return this.createErrorElement('Universe not loaded');
        }

        const rules = extractRules(universe);
        const flatRules = rules.allRules || rules;

        return this.createSearchableRulesSection(flatRules);
    }

    createSearchableRulesSection(flatRules) {
        const container = document.createElement('div');
        container.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';

        // Header with count badge
        const header = document.createElement('div');
        header.style.cssText = 'display: flex; justify-content: space-between; align-items: center;';

        const titleEl = document.createElement('span');
        titleEl.style.cssText = 'color: #58a6ff; font-weight: bold; font-size: 14px;';
        titleEl.textContent = 'Rules';

        const countBadge = document.createElement('span');
        countBadge.style.cssText = `
            background: ${flatRules.length > 0 ? '#238636' : '#30363d'};
            color: white;
            font-size: 11px;
            padding: 2px 8px;
            border-radius: 12px;
        `;
        countBadge.textContent = `${flatRules.length} rule${flatRules.length !== 1 ? 's' : ''}`;

        header.appendChild(titleEl);
        header.appendChild(countBadge);
        container.appendChild(header);

        if (flatRules.length === 0) {
            const emptyEl = document.createElement('div');
            emptyEl.style.cssText = 'color: #8b949e; font-style: italic;';
            emptyEl.textContent = '(no rules defined)';
            container.appendChild(emptyEl);
            return container;
        }

        // Search input
        const { searchContainer, clearBtn } = this.createSearchInput(flatRules, container);
        container.appendChild(searchContainer);

        // Controls (expand/collapse all)
        const controlsEl = this.createControls(flatRules, container);
        container.appendChild(controlsEl);

        // Accordion container
        const accordionContainer = document.createElement('div');
        accordionContainer.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 4px;
        `;
        container.appendChild(accordionContainer);

        // Store references for updates
        container._countBadge = countBadge;
        container._controlsEl = controlsEl;
        container._accordionContainer = accordionContainer;
        container._clearBtn = clearBtn;

        // Initial render
        this.updateRulesDisplay(flatRules, container);

        return container;
    }

    createSearchInput(flatRules, container) {
        const searchContainer = document.createElement('div');
        searchContainer.style.cssText = 'position: relative;';

        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = 'Search rules by name (fuzzy)...';
        searchInput.value = this.searchTerm;
        searchInput.style.cssText = `
            width: 100%;
            padding: 6px 28px 6px 8px;
            background: #161b22;
            border: 1px solid #30363d;
            border-radius: 4px;
            color: #c9d1d9;
            font-size: 12px;
            outline: none;
            box-sizing: border-box;
        `;

        searchInput.addEventListener('focus', () => {
            searchInput.style.borderColor = '#58a6ff';
        });
        searchInput.addEventListener('blur', () => {
            searchInput.style.borderColor = '#30363d';
        });

        searchInput.addEventListener('input', (e) => {
            this.searchTerm = e.target.value;
            this.updateRulesDisplay(flatRules, container);
        });

        // Clear button
        const clearBtn = document.createElement('button');
        clearBtn.textContent = '✕';
        clearBtn.style.cssText = `
            position: absolute;
            right: 6px;
            top: 6px;
            background: none;
            border: none;
            color: #8b949e;
            cursor: pointer;
            font-size: 14px;
            padding: 0;
            width: 20px;
            height: 20px;
            display: ${this.searchTerm ? 'block' : 'none'};
        `;
        clearBtn.addEventListener('click', () => {
            this.searchTerm = '';
            searchInput.value = '';
            clearBtn.style.display = 'none';
            this.updateRulesDisplay(flatRules, container);
        });

        searchContainer.appendChild(searchInput);
        searchContainer.appendChild(clearBtn);

        return { searchContainer, clearBtn };
    }

    createControls(flatRules, container) {
        const controlsEl = document.createElement('div');
        controlsEl.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 11px;
            color: #8b949e;
        `;

        const countEl = document.createElement('span');
        controlsEl.appendChild(countEl);

        const buttonsEl = document.createElement('div');
        buttonsEl.style.cssText = 'display: flex; gap: 8px; align-items: center;';

        const expandAllBtn = this.createControlButton('Expand all', () => {
            this.expandedRules.clear();
            const filtered = this.filterRules(flatRules, this.searchTerm);
            filtered.forEach(r => this.expandedRules.add(r.name));
            this.updateRulesDisplay(flatRules, container);
        });

        const collapseAllBtn = this.createControlButton('Collapse all', () => {
            this.expandedRules.clear();
            this.updateRulesDisplay(flatRules, container);
        });

        const separator = document.createElement('span');
        separator.textContent = '|';

        buttonsEl.appendChild(expandAllBtn);
        buttonsEl.appendChild(separator);
        buttonsEl.appendChild(collapseAllBtn);
        controlsEl.appendChild(buttonsEl);

        return controlsEl;
    }

    createControlButton(text, onClick) {
        const btn = document.createElement('button');
        btn.textContent = text;
        btn.style.cssText = `
            background: none;
            border: none;
            color: #8b949e;
            cursor: pointer;
            font-size: 11px;
            padding: 0;
        `;
        btn.addEventListener('click', onClick);
        btn.addEventListener('mouseenter', () => {
            btn.style.color = '#58a6ff';
        });
        btn.addEventListener('mouseleave', () => {
            btn.style.color = '#8b949e';
        });
        return btn;
    }

    filterRules(rules, searchTerm) {
        if (!searchTerm.trim()) return rules;
        return rules.filter(rule => fuzzyMatch(rule.name, searchTerm));
    }

    updateRulesDisplay(allRules, container) {
        const filtered = this.filterRules(allRules, this.searchTerm);

        const countBadge = container._countBadge;
        const controlsEl = container._controlsEl;
        const accordionContainer = container._accordionContainer;
        const clearBtn = container._clearBtn;

        // Update count display
        const countEl = controlsEl.firstChild;
        if (this.searchTerm) {
            countEl.textContent = `Found ${filtered.length} of ${allRules.length} rules`;
        } else {
            countEl.textContent = `${allRules.length} rules total`;
        }

        // Update badge
        countBadge.textContent = `${filtered.length} rule${filtered.length !== 1 ? 's' : ''}`;

        // Update clear button visibility
        clearBtn.style.display = this.searchTerm ? 'block' : 'none';

        // Clear accordion
        accordionContainer.innerHTML = '';

        if (filtered.length === 0) {
            const emptyEl = document.createElement('div');
            emptyEl.style.cssText = 'text-align: center; padding: 16px; color: #8b949e;';
            emptyEl.textContent = `No rules match "${this.searchTerm}"`;
            accordionContainer.appendChild(emptyEl);
            return;
        }

        // Render accordion items
        filtered.forEach(rule => {
            const item = this.createRuleAccordionItem(rule, this.searchTerm, allRules, container);
            accordionContainer.appendChild(item);
        });
    }

    createRuleAccordionItem(rule, searchTerm, allRules, container) {
        const isExpanded = this.expandedRules.has(rule.name);

        const item = document.createElement('div');
        item.style.cssText = `
            background: ${isExpanded ? 'rgba(88, 166, 255, 0.1)' : '#161b22'};
            border: 1px solid ${isExpanded ? '#58a6ff' : '#30363d'};
            border-radius: 4px;
            overflow: hidden;
            transition: all 0.2s;
        `;

        // Header button
        const header = document.createElement('button');
        header.style.cssText = `
            width: 100%;
            padding: 8px;
            background: none;
            border: none;
            color: inherit;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
            text-align: left;
        `;

        const chevron = document.createElement('span');
        chevron.style.cssText = 'font-size: 10px; opacity: 0.6;';
        chevron.textContent = isExpanded ? '▼' : '▶';

        const titleEl = document.createElement('span');
        titleEl.style.cssText = 'font-size: 12px; color: #58a6ff; font-weight: 500;';
        titleEl.innerHTML = highlightMatches(rule.name, searchTerm);

        header.appendChild(chevron);
        header.appendChild(titleEl);

        header.addEventListener('click', () => {
            if (this.expandedRules.has(rule.name)) {
                this.expandedRules.delete(rule.name);
            } else {
                this.expandedRules.add(rule.name);
            }
            this.updateRulesDisplay(allRules, container);
        });

        header.addEventListener('mouseenter', () => {
            if (!isExpanded) {
                item.style.borderColor = '#484f58';
                item.style.background = 'rgba(255, 255, 255, 0.03)';
            }
        });

        header.addEventListener('mouseleave', () => {
            if (!isExpanded) {
                item.style.borderColor = '#30363d';
                item.style.background = '#161b22';
            }
        });

        item.appendChild(header);

        // Content (when expanded)
        if (isExpanded) {
            const content = this.createRuleContent(rule);
            item.appendChild(content);
        }

        return item;
    }

    createRuleContent(rule) {
        const content = document.createElement('div');
        content.style.cssText = `
            border-top: 1px solid #30363d;
            padding: 8px;
            display: flex;
            flex-direction: column;
            gap: 8px;
        `;

        // Pattern
        this.addLabeledCode(content, 'Pattern:', this.parser.prettyPrint(rule.lhs, 1));

        // Replacement
        this.addLabeledCode(content, 'Replacement:', this.parser.prettyPrint(rule.rhs, 1));

        // Guard (if present)
        if (rule.guard) {
            this.addLabeledCode(content, 'Guard:', this.parser.prettyPrint(rule.guard, 1));
        }

        // Priority (if not default)
        if (rule.prio !== 0 && rule.prio !== 500) {
            this.addLabel(content, `Priority: ${rule.prio}`);
        }

        // Module tag (if available)
        if (rule.module) {
            this.addLabel(content, `Module: ${rule.module}`);
        }

        return content;
    }

    addLabeledCode(container, label, code) {
        const labelEl = document.createElement('div');
        labelEl.style.cssText = 'font-size: 10px; color: #8b949e; text-transform: uppercase;';
        labelEl.textContent = label;

        const codeEl = createHighlightedCodeElement(code);

        container.appendChild(labelEl);
        container.appendChild(codeEl);
    }

    addLabel(container, text) {
        const labelEl = document.createElement('div');
        labelEl.style.cssText = 'font-size: 10px; color: #8b949e; margin-top: 4px;';
        labelEl.textContent = text;
        container.appendChild(labelEl);
    }

    createErrorElement(message) {
        const el = document.createElement('div');
        el.style.cssText = 'color: #f85149;';
        el.textContent = message;
        return el;
    }
}
