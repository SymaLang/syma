import React, { useState, useRef, useEffect, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import {
    PlayIcon,
    StopIcon,
    TrashIcon,
    ChevronUpIcon,
    ChevronDownIcon,
    PlusIcon,
    CommandLineIcon,
    ExclamationCircleIcon,
    CheckCircleIcon,
    ChevronDoubleUpIcon
} from '@heroicons/react/24/outline';
import { useNotebookStore, CellStatus } from '../notebook-store';
import { getNotebookEngine } from '../notebook-engine';
import { registerSymaLanguage, registerCompletionProvider } from '../syma-language';
import { Tooltip, KeyboardShortcut } from './Tooltip';
// Design tokens removed - using Tailwind classes directly

export function CodeCell({ cell, isSelected, onSelect, onAddBelow, onRunAllAbove }) {
    const editorRef = useRef(null);
    const monacoRef = useRef(null);
    const [isExecuting, setIsExecuting] = useState(false);
    const { updateCell, setCellOutput, setCellError, setCellStatus, deleteCell, moveCell, isMovingCells } = useNotebookStore();
    const engine = getNotebookEngine();

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

        setIsExecuting(true);
        setCellStatus(cell.id, CellStatus.RUNNING);

        try {
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

    const ActionButton = ({ onClick, icon: Icon, tooltip, danger = false, primary = false }) => (
        <Tooltip content={tooltip} placement="right" delay={300}>
            <button
                onClick={onClick}
                className={`
                    relative p-2 rounded-lg
                    ${primary ? 'bg-blue-500 text-white'
                        : danger ? 'bg-zinc-800 text-gray-400 hover:bg-red-950 hover:text-white'
                        : 'bg-zinc-800 text-gray-400 hover:bg-zinc-700 hover:text-white'}
                `}
            >
                <Icon className="w-4 h-4" />
            </button>
        </Tooltip>
    );

    const [toolbarVisible, setToolbarVisible] = useState(false);

    return (
        <div
            className="group/cell relative"
            onMouseEnter={() => setToolbarVisible(true)}
            onMouseLeave={(e) => {
                // Check if mouse is leaving to the toolbar
                const rect = e.currentTarget.getBoundingClientRect();
                const isLeavingToToolbar = e.clientX < rect.left && e.clientX >= rect.left - 96; // 96px = 24*4 (toolbar width)
                if (!isLeavingToToolbar) {
                    setToolbarVisible(false);
                }
            }}
        >
            {/* Toolbar with its own hover detection */}
            <div
                className={`absolute -left-24 top-2 z-[100] flex flex-col gap-1.5 p-1.5 rounded-lg bg-zinc-800/85 backdrop-blur border border-zinc-700 transition-opacity duration-200 ${
                    toolbarVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                }`}
                onMouseEnter={() => setToolbarVisible(true)}
                onMouseLeave={() => setToolbarVisible(false)}
                style={{ minHeight: 'fit-content' }}
            >
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

                <div className="flex flex-col gap-1">
                    <ActionButton
                        onClick={() => moveCell(cell.id, 'up')}
                        icon={ChevronUpIcon}
                        tooltip="Move up"
                    />
                    <ActionButton
                        onClick={() => moveCell(cell.id, 'down')}
                        icon={ChevronDownIcon}
                        tooltip="Move down"
                    />
                </div>

                <ActionButton
                    onClick={onAddBelow}
                    icon={PlusIcon}
                    tooltip={
                        <div>
                            Add cell below
                            <KeyboardShortcut keys={['cmd', 'enter']} />
                        </div>
                    }
                />

                <div className="mt-2">
                    <ActionButton
                        onClick={() => deleteCell(cell.id)}
                        icon={TrashIcon}
                        danger
                        tooltip="Delete cell"
                    />
                </div>
            </div>

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