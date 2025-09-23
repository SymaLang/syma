import React, { useState, useRef, useEffect, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import {
    PlayIcon,
    StopIcon,
    TrashIcon,
    ChevronUpIcon,
    ChevronDownIcon,
    PlusIcon
} from '@heroicons/react/24/outline';
import { useNotebookStore, CellStatus } from '../notebook-store';
import { getNotebookEngine } from '../notebook-engine';
import { registerSymaLanguage, registerCompletionProvider } from '../syma-language';

export function CodeCell({ cell, isSelected, onSelect, onAddBelow }) {
    const editorRef = useRef(null);
    const monacoRef = useRef(null);
    const [isExecuting, setIsExecuting] = useState(false);
    const { updateCell, setCellOutput, setCellError, setCellStatus, deleteCell, moveCell } = useNotebookStore();
    const engine = getNotebookEngine();

    // Initialize Monaco
    const handleEditorDidMount = (editor, monaco) => {
        editorRef.current = editor;
        monacoRef.current = monaco;

        // Register Syma language only once
        if (!monaco.languages.getLanguages().some(lang => lang.id === 'syma')) {
            registerSymaLanguage(monaco);

            // Register completion provider
            registerCompletionProvider(monaco, (text, pos) =>
                engine.getCompletions(text, pos)
            );
        }

        // Focus if selected
        if (isSelected) {
            editor.focus();
        }
    };

    // Execute cell
    const handleExecute = useCallback(async () => {
        if (isExecuting || !cell.content.trim()) return;

        setIsExecuting(true);
        setCellStatus(cell.id, CellStatus.RUNNING);

        try {
            // Check if it's a command
            if (cell.content.trim().startsWith(':')) {
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

        // Store actions for cleanup
        const actions = [];

        try {
            // Use addAction which returns a proper disposable
            // Make IDs unique per cell to avoid conflicts
            const action1 = editor.addAction({
                id: `run-cell-${cell.id}`,
                label: 'Run Cell',
                keybindings: [monaco.KeyMod.Shift | monaco.KeyCode.Enter],
                run: () => {
                    handleExecute();
                }
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
        } catch (error) {
            console.warn('Failed to add editor actions:', error);
        }

        return () => {
            // Safely dispose of all actions
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
    }, [isSelected, handleExecute, onAddBelow, cell.id]);

    const statusColor = {
        [CellStatus.IDLE]: 'border-gray-700',
        [CellStatus.RUNNING]: 'border-blue-500 animate-pulse',
        [CellStatus.SUCCESS]: 'border-green-500',
        [CellStatus.ERROR]: 'border-red-500'
    };

    return (
        <div className="group/cell relative">
            <div
                className={`relative bg-neutral-900 border-l-4 transition-all ${statusColor[cell.status]} ${
                    isSelected ? 'ring-2 ring-blue-500/50' : ''
                }`}
                onClick={onSelect}
            >
                {/* Cell toolbar - visible on cell hover OR toolbar hover */}
                <div className="absolute -left-20 top-0 flex flex-col gap-1 opacity-0 group-hover/cell:opacity-100 hover:opacity-100 transition-opacity z-20 overflow-visible">
                    <button
                    onClick={handleExecute}
                    disabled={isExecuting}
                    className="p-1.5 bg-neutral-800 hover:bg-neutral-700 rounded text-gray-400 hover:text-white disabled:opacity-50"
                    title="Run cell (Shift+Enter)"
                >
                    {isExecuting ? (
                        <StopIcon className="w-4 h-4" />
                    ) : (
                        <PlayIcon className="w-4 h-4" />
                    )}
                </button>
                <button
                    onClick={() => moveCell(cell.id, 'up')}
                    className="p-1.5 bg-neutral-800 hover:bg-neutral-700 rounded text-gray-400 hover:text-white"
                    title="Move up"
                >
                    <ChevronUpIcon className="w-4 h-4" />
                </button>
                <button
                    onClick={() => moveCell(cell.id, 'down')}
                    className="p-1.5 bg-neutral-800 hover:bg-neutral-700 rounded text-gray-400 hover:text-white"
                    title="Move down"
                >
                    <ChevronDownIcon className="w-4 h-4" />
                </button>
                <button
                    onClick={onAddBelow}
                    className="p-1.5 bg-neutral-800 hover:bg-neutral-700 rounded text-gray-400 hover:text-white"
                    title="Add cell below"
                >
                    <PlusIcon className="w-4 h-4" />
                </button>
                <button
                    onClick={() => deleteCell(cell.id)}
                    className="p-1.5 bg-neutral-800 hover:bg-neutral-700 rounded text-gray-400 hover:text-red-400"
                    title="Delete cell"
                >
                    <TrashIcon className="w-4 h-4" />
                </button>
            </div>

            {/* Execution count */}
            {cell.executionCount !== null && (
                <div className="absolute left-2 top-2 text-xs text-gray-500 font-mono">
                    [{cell.executionCount}]
                </div>
            )}

            {/* Editor */}
            <div className="min-h-[80px]">
                <Editor
                    height={Math.max(80, (cell.content.split('\n').length + 1) * 20)}
                    language="syma"
                    theme="syma-dark"
                    value={cell.content}
                    onChange={(value) => updateCell(cell.id, { content: value || '' })}
                    onMount={handleEditorDidMount}
                    options={{
                        minimap: { enabled: false },
                        lineNumbers: 'on',
                        glyphMargin: false,
                        folding: false,
                        lineDecorationsWidth: 10,
                        lineNumbersMinChars: 4,
                        renderLineHighlight: 'none',
                        scrollBeyondLastLine: false,
                        fontSize: 14,
                        fontFamily: 'JetBrains Mono, Monaco, Consolas, monospace',
                        automaticLayout: true,
                        padding: { top: 10, bottom: 10, left: 10, right: 10 },
                        overviewRulerLanes: 0,
                        hideCursorInOverviewRuler: true,
                        overviewRulerBorder: false,
                        scrollbar: {
                            vertical: 'auto',
                            horizontal: 'hidden',
                            useShadows: false,
                            verticalSliderSize: 5
                        }
                    }}
                />
            </div>

            {/* Output */}
            {cell.outputs.length > 0 && (
                <div className="border-t border-neutral-800 bg-black/50 p-4 font-mono text-sm">
                    {cell.outputs.map((output, i) => (
                        <div key={i} className="mb-2 last:mb-0">
                            {output.type === 'error' ? (
                                <div className="text-red-400">
                                    <div className="font-bold mb-1">Error:</div>
                                    <pre className="whitespace-pre-wrap">{output.content}</pre>
                                    {output.traceback && (
                                        <details className="mt-2">
                                            <summary className="cursor-pointer text-xs text-gray-500">Traceback</summary>
                                            <pre className="text-xs text-gray-400 mt-1">{output.traceback}</pre>
                                        </details>
                                    )}
                                </div>
                            ) : output.type === 'result' ? (
                                <div className="text-green-400">
                                    <span className="text-gray-500">→ </span>
                                    <span>{output.content}</span>
                                </div>
                            ) : (
                                <div className="text-gray-300 whitespace-pre-wrap">{output.content}</div>
                            )}
                        </div>
                    ))}
                </div>
            )}
            </div>
        </div>
    );
}