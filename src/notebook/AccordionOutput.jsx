import React, { useState } from 'react';

/**
 * AccordionOutput component for rendering collapsible sections in the notebook
 *
 * @param {Object} props
 * @param {Array} props.sections - Array of section objects with:
 *   - title: Section title
 *   - content: Section content (string or React element)
 *   - expanded: Initial expanded state
 *   - className: Optional CSS class for styling
 */
export function AccordionOutput({ sections = [] }) {
    const [expandedSections, setExpandedSections] = useState(() => {
        // Initialize expanded state from props
        const initial = {};
        sections.forEach((section, index) => {
            initial[index] = section.expanded !== false;
        });
        return initial;
    });

    const toggleSection = (index) => {
        setExpandedSections(prev => ({
            ...prev,
            [index]: !prev[index]
        }));
    };

    return (
        <div className="accordion-output">
            {sections.map((section, index) => (
                <div
                    key={index}
                    className={`accordion-section ${section.className || ''} ${
                        expandedSections[index] ? 'expanded' : 'collapsed'
                    }`}
                >
                    <button
                        className="accordion-header"
                        onClick={() => toggleSection(index)}
                        aria-expanded={expandedSections[index]}
                    >
                        <span className="accordion-toggle">
                            {expandedSections[index] ? '▼' : '▶'}
                        </span>
                        <span className="accordion-title">{section.title}</span>
                    </button>
                    {expandedSections[index] && (
                        <div className="accordion-content">
                            <pre className="code-output">{section.content}</pre>
                        </div>
                    )}
                </div>
            ))}

            <style jsx>{`
                .accordion-output {
                    margin: 8px 0;
                    font-family: 'Monaco', 'Courier New', monospace;
                }

                .accordion-section {
                    border: 1px solid #333;
                    border-radius: 6px;
                    margin-bottom: 4px;
                    background: #1a1a1a;
                    overflow: hidden;
                }

                .accordion-section.rewrite-result {
                    border-color: #4a9eff;
                    background: linear-gradient(135deg, #1a1a1a 0%, #1e2433 100%);
                }

                .accordion-section.normalization-info {
                    border-color: #666;
                }

                .accordion-section.variable-bindings {
                    border-color: #666;
                }

                .accordion-header {
                    width: 100%;
                    padding: 8px 12px;
                    background: transparent;
                    border: none;
                    color: #e0e0e0;
                    font-size: 14px;
                    text-align: left;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    transition: background-color 0.2s;
                }

                .accordion-header:hover {
                    background: rgba(255, 255, 255, 0.05);
                }

                .accordion-toggle {
                    font-size: 10px;
                    width: 12px;
                    transition: transform 0.2s;
                }

                .accordion-title {
                    flex: 1;
                    font-weight: 500;
                }

                .accordion-content {
                    padding: 12px;
                    border-top: 1px solid #333;
                    background: rgba(0, 0, 0, 0.2);
                }

                .code-output {
                    margin: 0;
                    padding: 8px;
                    background: #0d0d0d;
                    border-radius: 4px;
                    overflow-x: auto;
                    font-size: 13px;
                    line-height: 1.4;
                    color: #c0c0c0;
                    white-space: pre-wrap;
                    word-wrap: break-word;
                }

                /* Special styling for expanded rewrite results */
                .accordion-section.rewrite-result.expanded .accordion-header {
                    background: rgba(74, 158, 255, 0.1);
                }
            `}</style>
        </div>
    );
}

/**
 * Helper function to render accordion output in the notebook cell
 * This can be called from the notebook's output rendering logic
 */
export function renderAccordionOutput(outputElement, sections) {
    // For vanilla JS integration without React
    const container = document.createElement('div');
    container.className = 'accordion-output';

    sections.forEach((section, index) => {
        const sectionDiv = document.createElement('div');
        sectionDiv.className = `accordion-section ${section.className || ''} ${
            section.expanded ? 'expanded' : 'collapsed'
        }`;

        const header = document.createElement('button');
        header.className = 'accordion-header';
        header.innerHTML = `
            <span class="accordion-toggle">${section.expanded ? '▼' : '▶'}</span>
            <span class="accordion-title">${section.title}</span>
        `;

        const content = document.createElement('div');
        content.className = 'accordion-content';
        content.style.display = section.expanded ? 'block' : 'none';
        content.innerHTML = `<pre class="code-output">${escapeHtml(section.content)}</pre>`;

        header.addEventListener('click', () => {
            const isExpanded = content.style.display === 'block';
            content.style.display = isExpanded ? 'none' : 'block';
            header.querySelector('.accordion-toggle').textContent = isExpanded ? '▶' : '▼';
            sectionDiv.classList.toggle('expanded');
            sectionDiv.classList.toggle('collapsed');
        });

        sectionDiv.appendChild(header);
        if (section.expanded) {
            sectionDiv.appendChild(content);
        }

        container.appendChild(sectionDiv);
    });

    outputElement.appendChild(container);

    // Add styles if not already present
    if (!document.getElementById('accordion-output-styles')) {
        const styleElement = document.createElement('style');
        styleElement.id = 'accordion-output-styles';
        styleElement.textContent = getAccordionStyles();
        document.head.appendChild(styleElement);
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getAccordionStyles() {
    return `
        .accordion-output {
            margin: 8px 0;
            font-family: 'Monaco', 'Courier New', monospace;
        }

        .accordion-section {
            border: 1px solid #333;
            border-radius: 6px;
            margin-bottom: 4px;
            background: #1a1a1a;
            overflow: hidden;
        }

        .accordion-section.rewrite-result {
            border-color: #4a9eff;
            background: linear-gradient(135deg, #1a1a1a 0%, #1e2433 100%);
        }

        .accordion-header {
            width: 100%;
            padding: 8px 12px;
            background: transparent;
            border: none;
            color: #e0e0e0;
            font-size: 14px;
            text-align: left;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
            transition: background-color 0.2s;
        }

        .accordion-header:hover {
            background: rgba(255, 255, 255, 0.05);
        }

        .accordion-toggle {
            font-size: 10px;
            width: 12px;
        }

        .accordion-content {
            padding: 12px;
            border-top: 1px solid #333;
            background: rgba(0, 0, 0, 0.2);
        }

        .code-output {
            margin: 0;
            padding: 8px;
            background: #0d0d0d;
            border-radius: 4px;
            overflow-x: auto;
            font-size: 13px;
            line-height: 1.4;
            color: #c0c0c0;
            white-space: pre-wrap;
        }
    `;
}