/*****************************************************************
 * Program Section Component
 *
 * Displays the pretty-printed Program section from the universe
 ******************************************************************/

import { getProgram } from '@syma/core/engine';
import { createHighlightedCodeElement } from './syntax-highlighter.js';

export class ProgramSection {
    constructor(parser, getUniverse) {
        this.parser = parser;
        this.getUniverse = getUniverse;
    }

    render() {
        const universe = this.getUniverse();
        if (!universe) {
            return this.createErrorElement('Universe not loaded');
        }

        const program = getProgram(universe);
        return this.createSection('Program', program);
    }

    createSection(title, content) {
        const container = document.createElement('div');
        container.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';

        const titleEl = document.createElement('div');
        titleEl.style.cssText = 'color: #58a6ff; font-weight: bold; font-size: 14px;';
        titleEl.textContent = title;

        if (!content) {
            const emptyEl = document.createElement('div');
            emptyEl.style.cssText = 'color: #8b949e; font-style: italic;';
            emptyEl.textContent = '(empty)';
            container.appendChild(titleEl);
            container.appendChild(emptyEl);
            return container;
        }

        const prettyContent = this.parser.prettyPrint(content, 0, { maxWidth: 70 });

        const contentEl = document.createElement('div');
        contentEl.style.cssText = `
            background: #161b22;
            border: 1px solid #30363d;
            border-radius: 6px;
            padding: 12px;
            overflow-x: auto;
        `;

        // Add syntax-highlighted code
        const codeEl = createHighlightedCodeElement(prettyContent, {
            fontSize: '12px',
            lineHeight: '1.6'
        });
        contentEl.appendChild(codeEl);

        container.appendChild(titleEl);
        container.appendChild(contentEl);
        return container;
    }

    createErrorElement(message) {
        const el = document.createElement('div');
        el.style.cssText = 'color: #f85149;';
        el.textContent = message;
        return el;
    }
}
