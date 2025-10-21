import React, { useState } from 'react';
import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline';

/**
 * SearchableAccordionOutput component for rendering searchable, collapsible sections
 * Perfect for displaying rules, documentation, or any large collection of items
 *
 * @param {Object} props
 * @param {Array} props.sections - Array of section objects with:
 *   - title: Section title (displayed)
 *   - content: Section content (string)
 *   - expanded: Initial expanded state (optional)
 *   - searchableTitle: Text used for search (optional, defaults to title)
 * @param {string} props.placeholder - Placeholder text for search input
 * @param {string} props.itemLabel - Label for items (e.g., 'rules', 'functions')
 * @param {string} props.cellId - Cell ID for tracking
 * @param {number} props.outputIndex - Output index within the cell
 */
export function SearchableAccordionOutput({
    sections = [],
    placeholder = 'Search...',
    itemLabel = 'items',  // Custom label for items (e.g., 'rules', 'functions', etc.)
    cellId,
    outputIndex
}) {
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedSections, setExpandedSections] = useState({});

    // Fuzzy search function
    const fuzzyMatch = (str, pattern) => {
        const patternLower = pattern.toLowerCase();
        const strLower = str.toLowerCase();

        // Simple fuzzy match: all pattern characters must appear in order
        let patternIdx = 0;
        for (let i = 0; i < strLower.length && patternIdx < patternLower.length; i++) {
            if (strLower[i] === patternLower[patternIdx]) {
                patternIdx++;
            }
        }
        return patternIdx === patternLower.length;
    };

    // Filter sections based on search term
    const filteredSections = searchTerm.trim() === ''
        ? sections
        : sections.filter(section => {
            const searchableText = section.searchableTitle || section.title.toLowerCase();
            return fuzzyMatch(searchableText, searchTerm);
        });

    const toggleSection = (index) => {
        setExpandedSections(prev => ({
            ...prev,
            [index]: !prev[index]
        }));
    };

    // Expand/collapse all filtered sections
    const toggleAll = (expand) => {
        const newState = {};
        filteredSections.forEach((_, index) => {
            const originalIndex = sections.indexOf(filteredSections[index]);
            newState[originalIndex] = expand;
        });
        setExpandedSections(newState);
    };

    // Highlight matching characters in title
    const highlightMatches = (text, searchTerm) => {
        if (!searchTerm) return text;

        const parts = [];
        const textLower = text.toLowerCase();
        const searchLower = searchTerm.toLowerCase();
        let lastIndex = 0;
        let searchIndex = 0;

        for (let i = 0; i < text.length && searchIndex < searchLower.length; i++) {
            if (textLower[i] === searchLower[searchIndex]) {
                // Add non-matching part before this character
                if (i > lastIndex) {
                    parts.push(
                        <span key={`normal-${i}`}>
                            {text.substring(lastIndex, i)}
                        </span>
                    );
                }
                // Add matching character with highlight
                parts.push(
                    <span key={`match-${i}`} className="bg-blue-500/30 text-blue-300">
                        {text[i]}
                    </span>
                );
                lastIndex = i + 1;
                searchIndex++;
            }
        }

        // Add remaining text
        if (lastIndex < text.length) {
            parts.push(
                <span key={`normal-end`}>
                    {text.substring(lastIndex)}
                </span>
            );
        }

        return parts;
    };

    return (
        <div className="searchable-accordion-output">
            {/* Search box */}
            <div className="mb-4 relative">
                <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder={placeholder}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 pr-10"
                    autoFocus
                />
                {searchTerm && (
                    <button
                        onClick={() => setSearchTerm('')}
                        className="absolute right-2 top-2.5 text-gray-500 hover:text-white transition-colors"
                        title="Clear search"
                    >
                        ✕
                    </button>
                )}
            </div>

            {/* Results count and controls */}
            {filteredSections.length > 0 && (
                <div className="flex justify-between items-center mb-2 text-xs text-gray-500">
                    <span>
                        {searchTerm && `Found ${filteredSections.length} of ${sections.length} ${itemLabel}`}
                        {!searchTerm && `${sections.length} ${itemLabel} total`}
                    </span>
                    <div className="flex gap-2">
                        <button
                            onClick={() => toggleAll(true)}
                            className="hover:text-blue-400 transition-colors"
                        >
                            Expand all
                        </button>
                        <span>|</span>
                        <button
                            onClick={() => toggleAll(false)}
                            className="hover:text-blue-400 transition-colors"
                        >
                            Collapse all
                        </button>
                    </div>
                </div>
            )}

            {/* Accordion sections */}
            <div className="-mx-2 max-h-[600px] overflow-y-auto">
                {filteredSections.length === 0 ? (
                    <div className="text-center py-4 text-gray-500">
                        No {itemLabel} match "{searchTerm}"
                    </div>
                ) : (
                    filteredSections.map((section, filteredIndex) => {
                        const originalIndex = sections.indexOf(section);
                        const isExpanded = expandedSections[originalIndex];

                        return (
                            <div
                                key={originalIndex}
                                className={`
                                    border rounded-md mb-2 overflow-hidden transition-all
                                    ${isExpanded
                                        ? 'border-blue-500/50 bg-blue-950/20'
                                        : 'border-zinc-700 bg-zinc-800/50 hover:border-zinc-600'}
                                `}
                            >
                                <button
                                    className="w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-white/5 transition-colors"
                                    onClick={() => toggleSection(originalIndex)}
                                    aria-expanded={isExpanded}
                                >
                                    <span className="text-xs opacity-60">
                                        {isExpanded ? (
                                            <ChevronDownIcon className="w-3 h-3" />
                                        ) : (
                                            <ChevronRightIcon className="w-3 h-3" />
                                        )}
                                    </span>
                                    <span className="text-sm font-medium text-blue-400">
                                        {searchTerm ? highlightMatches(section.title, searchTerm) : section.title}
                                    </span>
                                </button>
                                {isExpanded && (
                                    <div className="border-t border-zinc-700 px-3 py-2">
                                        <pre className="text-xs leading-relaxed text-gray-300 overflow-x-auto font-mono">
                                            {section.content}
                                        </pre>
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}

/**
 * Helper function for non-React integration (if needed)
 */
export function renderSearchableAccordionOutput(outputElement, sections, placeholder) {
    // This would require React DOM rendering
    // For now, this is a placeholder for potential vanilla JS integration
    console.warn('SearchableAccordionOutput requires React for full functionality');
}