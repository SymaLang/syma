import React, { useState, useRef, useEffect, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import {
    PlayIcon,
    StopIcon,
    CommandLineIcon,
    ExclamationCircleIcon,
    CheckCircleIcon,
    ChevronDoubleUpIcon,
    ChevronDownIcon,
    ChevronRightIcon
} from '@heroicons/react/24/outline';
import { useNotebookStore, CellStatus } from '../notebook-store';
import { getNotebookEngine } from '../notebook-engine';
import { registerSymaLanguage, registerCompletionProvider } from '../syma-language';
import { KeyboardShortcut } from './Tooltip';
import { ActionButton, CellToolbar, CellControls, useToolbarVisibility } from './CellCommon';
import { clearCellAccordionStates } from '../utils/accordion-state';
// Design tokens removed - using Tailwind classes directly

// Component to render accordion outputs with persistent state
const AccordionOutput = ({ sections = [], cellId, outputIndex }) => {
    // Create a unique ID for this accordion group
    const accordionId = `accordion-${cellId}-${outputIndex}`;

    const [expandedSections, setExpandedSections] = useState(() => {
        // Try to restore state from localStorage first
        const storageKey = `syma-accordion-${accordionId}`;
        const savedState = localStorage.getItem(storageKey);

        if (savedState) {
            try {
                return JSON.parse(savedState);
            } catch (e) {
                // Invalid saved state, fall through to default
            }
        }

        // Otherwise, check if sections have saved expanded state
        const initial = {};
        sections.forEach((section, index) => {
            // Check if section has persistedExpanded property (from saved notebook)
            initial[index] = section.persistedExpanded !== undefined
                ? section.persistedExpanded
                : (section.expanded !== false);
        });
        return initial;
    });

    // Update cell output metadata when expansion state changes
    const updateCell = useNotebookStore(state => state.updateCell);

    const toggleSection = (index) => {
        setExpandedSections(prev => {
            const newState = {
                ...prev,
                [index]: !prev[index]
            };

            // Save to localStorage
            const storageKey = `syma-accordion-${accordionId}`;
            localStorage.setItem(storageKey, JSON.stringify(newState));

            // Also update the cell output to include the expanded state
            // This will be saved with the notebook
            if (cellId && updateCell) {
                // Find the current cell and update this specific output
                const cell = useNotebookStore.getState().cells.find(c => c.id === cellId);
                if (cell) {
                    const updatedOutputs = [...cell.outputs];
                    if (updatedOutputs[outputIndex] && updatedOutputs[outputIndex].type === 'accordion') {
                        // Store the expanded state in the sections
                        updatedOutputs[outputIndex] = {
                            ...updatedOutputs[outputIndex],
                            sections: updatedOutputs[outputIndex].sections.map((sec, idx) => ({
                                ...sec,
                                persistedExpanded: idx === index ? newState[index] : newState[idx]
                            }))
                        };
                        updateCell(cellId, { outputs: updatedOutputs });
                    }
                }
            }

            return newState;
        });
    };

    // Clean up localStorage when component unmounts (optional)
    useEffect(() => {
        return () => {
            // Optionally clean up old accordion states older than 30 days
            const storageKeyPrefix = 'syma-accordion-';
            const now = Date.now();
            const thirtyDays = 30 * 24 * 60 * 60 * 1000;

            Object.keys(localStorage).forEach(key => {
                if (key.startsWith(storageKeyPrefix)) {
                    const timestamp = localStorage.getItem(`${key}-timestamp`);
                    if (timestamp && now - parseInt(timestamp) > thirtyDays) {
                        localStorage.removeItem(key);
                        localStorage.removeItem(`${key}-timestamp`);
                    }
                }
            });
        };
    }, []);

    // Save timestamp when accordion is created
    useEffect(() => {
        const storageKey = `syma-accordion-${accordionId}-timestamp`;
        localStorage.setItem(storageKey, Date.now().toString());
    }, [accordionId]);

    return (
        <div className="accordion-output -mx-2">
            {sections.map((section, index) => (
                <div
                    key={index}
                    className={`
                        border rounded-md mb-2 overflow-hidden
                        ${section.className === 'rewrite-result'
                            ? 'border-blue-500/50 bg-blue-950/20'
                            : 'border-zinc-700 bg-zinc-800/50'}
                    `}
                >
                    <button
                        className="w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-white/5 transition-colors"
                        onClick={() => toggleSection(index)}
                        aria-expanded={expandedSections[index]}
                    >
                        <span className="text-xs opacity-60">
                            {expandedSections[index] ? <ChevronDownIcon className="w-3 h-3" /> : <ChevronRightIcon className="w-3 h-3" />}
                        </span>
                        <span className="text-sm font-medium">{section.title}</span>
                    </button>
                    {expandedSections[index] && (
                        <div className="border-t border-zinc-700 px-3 py-2">
                            <pre className="text-xs leading-relaxed text-gray-300 overflow-x-auto">
                                {section.content}
                            </pre>
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
};

// Component to render DOM elements in output
const DOMOutput = ({ element }) => {
    const containerRef = React.useRef(null);

    React.useEffect(() => {
        if (containerRef.current && element) {
            // Clear any existing content
            containerRef.current.innerHTML = '';

            // Check if element is a valid DOM node
            if (element instanceof Node) {
                containerRef.current.appendChild(element);
            } else {
                // If not a valid node (e.g., after deserialization), show a message
                const placeholder = document.createElement('div');
                placeholder.style.cssText = 'padding: 8px; color: #888; font-style: italic; font-size: 14px;';
                placeholder.textContent = 'UI render output (re-run cell to display)';
                containerRef.current.appendChild(placeholder);
            }
        }
    }, [element]);

    return <div ref={containerRef} />;
};

export function CodeCell({ cell, isSelected, onSelect, onAddBelow, onRunAllAbove }) {
    const editorRef = useRef(null);
    const monacoRef = useRef(null);
    const [isExecuting, setIsExecuting] = useState(false);

    // Use selectors to only subscribe to specific store slices
    const updateCell = useNotebookStore(state => state.updateCell);
    const setCellOutput = useNotebookStore(state => state.setCellOutput);
    const setCellError = useNotebookStore(state => state.setCellError);
    const setCellStatus = useNotebookStore(state => state.setCellStatus);
    const isMovingCells = useNotebookStore(state => state.isMovingCells);
    const engine = getNotebookEngine();
    const { toolbarVisible, setToolbarVisible, handleMouseEnter, handleMouseLeave } = useToolbarVisibility();

    // Initialize Monaco
    const handleEditorDidMount = (editor, monaco) => {
        editorRef.current = editor;
        monacoRef.current = monaco;

        // Register Syma language only once
        if (!monaco.languages.getLanguages().some(lang => lang.id === 'syma')) {
            registerSymaLanguage(monaco);
            registerCompletionProvider(monaco, (text, pos) =>
                engine.getCompletions(text, pos)
            );
        }

        if (isSelected) {
            editor.focus();
        }
    };

    // Execute cell
    const handleExecute = useCallback(async () => {
        if (isExecuting || !cell.content.trim()) return;

        // Clear old accordion states for this cell before re-executing
        clearCellAccordionStates(cell.id);

        setIsExecuting(true);
        setCellStatus(cell.id, CellStatus.RUNNING);

        try {
            // Check if this is a command cell (starts with ':' command)
            const lines = cell.content.split('\n');

            // Find the first non-empty, non-comment line
            let firstContentLine = '';
            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed && !trimmed.startsWith(';')) {
                    firstContentLine = trimmed;
                    break;
                }
            }

            // If the first content line is a command, treat the entire cell as commands
            const isCommandCell = firstContentLine.startsWith(':');

            if (isCommandCell) {
                const { outputs, hasError } = await engine.executeCommand(cell.id, cell.content.trim());
                if (hasError) {
                    setCellError(cell.id, outputs[0]?.content || 'Unknown error');
                } else {
                    setCellOutput(cell.id, outputs);
                }
            } else {
                const { outputs, hasError } = await engine.executeCode(cell.id, cell.content);
                if (hasError) {
                    setCellError(cell.id, outputs[0]?.content || 'Unknown error');
                } else {
                    setCellOutput(cell.id, outputs);
                }
            }
        } catch (error) {
            setCellError(cell.id, error.message);
        } finally {
            setIsExecuting(false);
            setCellStatus(cell.id, CellStatus.IDLE);
        }
    }, [cell.content, cell.id, engine, isExecuting, setCellError, setCellOutput, setCellStatus]);

    // Handle keyboard shortcuts
    useEffect(() => {
        if (!editorRef.current || !monacoRef.current || !isSelected) return;

        const monaco = monacoRef.current;
        const editor = editorRef.current;
        const actions = [];

        try {
            const action1 = editor.addAction({
                id: `run-cell-${cell.id}`,
                label: 'Run Cell',
                keybindings: [monaco.KeyMod.Shift | monaco.KeyCode.Enter],
                run: () => handleExecute()
            });
            if (action1) actions.push(action1);

            const action2 = editor.addAction({
                id: `run-cell-and-add-${cell.id}`,
                label: 'Run Cell and Add Below',
                keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
                run: () => {
                    handleExecute();
                    onAddBelow();
                }
            });
            if (action2) actions.push(action2);

            const action3 = editor.addAction({
                id: `run-all-above-${cell.id}`,
                label: 'Run All Cells Above',
                keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter],
                run: () => {
                    if (onRunAllAbove) {
                        onRunAllAbove();
                    }
                }
            });
            if (action3) actions.push(action3);
        } catch (error) {
            console.warn('Failed to add editor actions:', error);
        }

        return () => {
            actions.forEach(action => {
                try {
                    if (action && typeof action.dispose === 'function') {
                        action.dispose();
                    }
                } catch (error) {
                    console.warn('Failed to dispose action:', error);
                }
            });
        };
    }, [isSelected, handleExecute, onAddBelow, onRunAllAbove, cell.id]);

    const getStatusClasses = (status) => {
        switch(status) {
            case CellStatus.IDLE:
                return 'border-l-zinc-700 bg-zinc-900';
            case CellStatus.RUNNING:
                return 'border-l-blue-500 bg-gradient-to-r from-zinc-900 to-blue-900/10';
            case CellStatus.SUCCESS:
                return 'border-l-green-500/60 bg-zinc-900';
            case CellStatus.ERROR:
                return 'border-l-red-500/60 bg-zinc-900';
            default:
                return 'border-l-zinc-700 bg-zinc-900';
        }
    };



    return (
        <div
            className="group/cell relative"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            <CellToolbar visible={toolbarVisible} onVisibilityChange={setToolbarVisible}>
                <ActionButton
                    onClick={handleExecute}
                    icon={isExecuting ? StopIcon : PlayIcon}
                    primary={!isExecuting}
                    tooltip={
                        <div>
                            {isExecuting ? 'Stop' : 'Run cell'}
                            {!isExecuting && <KeyboardShortcut keys={['shift', 'enter']} />}
                        </div>
                    }
                />

                {onRunAllAbove && (
                    <ActionButton
                        onClick={onRunAllAbove}
                        icon={ChevronDoubleUpIcon}
                        tooltip={
                            <div>
                                Run all cells above
                                <KeyboardShortcut keys={['cmd', 'shift', 'enter']} />
                            </div>
                        }
                    />
                )}

                <CellControls cellId={cell.id} onAddBelow={onAddBelow} />
            </CellToolbar>

            <div
                className={`
                    relative border-l-4
                    ${getStatusClasses(cell.status)}
                    ${isSelected ? 'shadow-xl' : 'shadow-md'}
                `}
                onClick={onSelect}
            >

                {/* Execution count badge */}
                {cell.executionCount !== null && (
                    <div className="absolute left-2 top-2 flex items-center gap-1.5 px-2 py-1 rounded-lg bg-zinc-800/85 backdrop-blur-sm border border-zinc-700 text-gray-400 text-xs font-semibold">
                        <CommandLineIcon className="w-3 h-3" />
                        {cell.executionCount}
                    </div>
                )}

                {/* Status indicator for running state */}
                {isExecuting && (
                    <div className="absolute top-0 left-0 h-0.5 w-full bg-gradient-to-r from-blue-500 to-blue-400 shadow-lg shadow-blue-500/50" />
                )}

                {/* Editor */}
                <div className={`min-h-[80px] ${cell.executionCount !== null ? 'pt-10' : ''}`}>
                    {!isMovingCells ? (
                        <Editor
                            key={cell.id}
                            height={Math.max(100, (cell.content.split('\n').length) * 21 + 32)}
                            language="syma"
                            theme="syma-modern"
                            value={cell.content}
                            onChange={(value) => updateCell(cell.id, { content: value || '' })}
                            onMount={handleEditorDidMount}
                        beforeMount={(monaco) => {
                            // Define theme only once, before any editor mounts
                            try {
                                monaco.editor.defineTheme('syma-modern', {
                                    base: 'vs-dark',
                                    inherit: true,
                                    rules: [
                                        { token: 'keyword', foreground: 'c792ea' },
                                        { token: 'operator', foreground: '89ddff' },
                                        { token: 'identifier', foreground: '82aaff' },
                                        { token: 'type.identifier', foreground: '4EC9B0' },
                                        { token: 'variable.parameter', foreground: 'ffcb6b' },
                                        { token: 'string', foreground: 'c3e88d' },
                                        { token: 'number', foreground: 'f78c6c' },
                                        { token: 'comment', foreground: '546e7a', fontStyle: 'italic' },
                                    ],
                                    colors: {
                                        'editor.background': '#18181bee',
                                        'editor.foreground': '#ffffff',
                                        'editor.lineHighlightBackground': 'transparent',
                                        'editorCursor.foreground': '#3b82f6',
                                        'editor.selectionBackground': '#3b82f630',
                                        'editorLineNumber.foreground': '#6b7280',
                                        'editorLineNumber.activeForeground': '#9ca3af',
                                        'editorGutter.background': 'transparent',
                                        'editor.lineHighlightBorder': 'transparent',
                                    }
                                });
                            } catch (e) {
                                // Theme might already be registered
                            }
                            monaco.editor.setTheme('syma-modern');
                        }}
                        options={{
                            minimap: { enabled: false },
                            lineNumbers: 'on',
                            glyphMargin: false,
                            folding: false,
                            lineDecorationsWidth: 10,
                            lineNumbersMinChars: 4,
                            renderLineHighlight: 'none',
                            scrollBeyondLastLine: false,
                            wordWrap: 'on',
                            wordWrapColumn: 100,
                            wrappingStrategy: 'advanced',
                            fontSize: 14,
                            fontFamily: '"JetBrains Mono", "Fira Code", Monaco, monospace',
                            fontLigatures: true,
                            automaticLayout: true,
                            padding: { top: 16, bottom: 16 },
                            overviewRulerLanes: 0,
                            hideCursorInOverviewRuler: true,
                            overviewRulerBorder: false,
                            scrollbar: {
                                vertical: 'auto',
                                horizontal: 'hidden',
                                useShadows: false,
                                verticalSliderSize: 6,
                                alwaysConsumeMouseWheel: false
                            },
                            renderWhitespace: 'selection',
                            smoothScrolling: true,
                        }}
                        />
                    ) : (
                        <div className="flex items-center justify-center" style={{ height: Math.max(100, (cell.content.split('\n').length) * 21 + 32) }}>
                        </div>
                    )}
                </div>

                {/* Output */}
                {cell.outputs.length > 0 && (
                    <div className="font-mono text-sm bg-black/25 border-t border-zinc-800 px-6 py-5">
                        {cell.outputs.map((output, i) => (
                            <div key={i} className="mb-3 last:mb-0">
                                {output.type === 'error' ? (
                                    <div className="flex gap-3">
                                        <div className="p-1 rounded-lg flex-shrink-0 bg-red-900/20">
                                            <ExclamationCircleIcon className="w-4 h-4 text-red-500" />
                                        </div>
                                        <div className="flex-1">
                                            <div className="font-semibold text-sm mb-1 text-red-500">
                                                Error
                                            </div>
                                            <pre className="whitespace-pre-wrap text-sm leading-relaxed text-gray-300">
                                                {output.content}
                                            </pre>
                                            {output.traceback && (
                                                <details className="mt-2 cursor-pointer">
                                                    <summary className="text-xs font-medium text-gray-500">
                                                        Show traceback
                                                    </summary>
                                                    <pre className="text-xs mt-2 p-2 rounded-lg overflow-x-auto bg-zinc-800 text-gray-500 border border-zinc-700">
                                                        {output.traceback}
                                                    </pre>
                                                </details>
                                            )}
                                        </div>
                                    </div>
                                ) : output.type === 'result' ? (
                                    <div className="flex gap-3">
                                        <div className="p-1 rounded-lg flex-shrink-0 bg-green-900/20">
                                            <CheckCircleIcon className="w-4 h-4 text-green-500" />
                                        </div>
                                        <code className="text-sm leading-relaxed font-medium text-green-400">
                                            {output.content}
                                        </code>
                                    </div>
                                ) : output.type === 'dom' ? (
                                    <div className="syma-dom-output">
                                        <DOMOutput element={output.element} />
                                    </div>
                                ) : output.type === 'accordion' ? (
                                    <AccordionOutput
                                        sections={output.sections || []}
                                        cellId={cell.id}
                                        outputIndex={i}
                                    />
                                ) : (
                                    <div className="pl-8 whitespace-pre-wrap text-sm leading-relaxed text-gray-300">
                                        {output.content}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}