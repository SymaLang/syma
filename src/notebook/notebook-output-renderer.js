/**
 * Notebook Output Renderer
 * Handles rendering different types of outputs in notebook cells
 */

import { renderAccordionOutput } from './AccordionOutput.jsx';

export class NotebookOutputRenderer {
    /**
     * Render output based on its type
     * @param {HTMLElement} container - The container element for the output
     * @param {Object} output - The output object from the notebook engine
     */
    static render(container, output) {
        switch (output.type) {
            case 'text':
                this.renderText(container, output.content);
                break;

            case 'result':
                this.renderResult(container, output.content);
                break;

            case 'error':
                this.renderError(container, output.content, output.traceback);
                break;

            case 'dom':
                this.renderDOM(container, output.element);
                break;

            case 'accordion':
                this.renderAccordion(container, output.sections);
                break;

            default:
                this.renderText(container, JSON.stringify(output));
        }
    }

    static renderText(container, content) {
        const pre = document.createElement('pre');
        pre.className = 'output-text';
        pre.textContent = content;
        container.appendChild(pre);
    }

    static renderResult(container, content) {
        const div = document.createElement('div');
        div.className = 'output-result';
        const pre = document.createElement('pre');
        pre.textContent = `→ ${content}`;
        div.appendChild(pre);
        container.appendChild(div);
    }

    static renderError(container, message, traceback) {
        const div = document.createElement('div');
        div.className = 'output-error';
        const pre = document.createElement('pre');
        pre.textContent = message;
        div.appendChild(pre);

        if (traceback) {
            const details = document.createElement('details');
            details.className = 'error-traceback';
            const summary = document.createElement('summary');
            summary.textContent = 'Stack trace';
            details.appendChild(summary);
            const trace = document.createElement('pre');
            trace.textContent = traceback;
            details.appendChild(trace);
            div.appendChild(details);
        }

        container.appendChild(div);
    }

    static renderDOM(container, element) {
        container.appendChild(element);
    }

    static renderAccordion(container, sections) {
        renderAccordionOutput(container, sections);
    }
}

/**
 * Example usage in a notebook cell component:
 *
 * function renderCellOutput(cellElement, outputs) {
 *     const outputContainer = cellElement.querySelector('.cell-output');
 *     outputContainer.innerHTML = ''; // Clear previous output
 *
 *     outputs.forEach(output => {
 *         NotebookOutputRenderer.render(outputContainer, output);
 *     });
 * }
 */