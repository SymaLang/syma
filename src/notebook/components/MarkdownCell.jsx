import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import Editor from '@monaco-editor/react';
import {
    PencilIcon,
    CheckIcon,
    TrashIcon,
    ChevronUpIcon,
    ChevronDownIcon,
    PlusIcon,
    DocumentTextIcon
} from '@heroicons/react/24/outline';
import { useNotebookStore } from '../notebook-store';
import { Tooltip, KeyboardShortcut } from './Tooltip';
// Design tokens removed - using Tailwind classes directly
import 'katex/dist/katex.min.css';

export function MarkdownCell({ cell, isSelected, onSelect, onAddBelow }) {
    const [isEditing, setIsEditing] = useState(false);
    const editorRef = useRef(null);
    const { updateCell, deleteCell, moveCell, isMovingCells } = useNotebookStore();

    // Enter edit mode on double click or when newly created
    useEffect(() => {
        if (isSelected && !cell.content && !isEditing) {
            setIsEditing(true);
        }
    }, [isSelected, cell.content, isEditing]);

    // Handle editor mount
    const handleEditorDidMount = (editor, monaco) => {
        editorRef.current = editor;
        editor.focus();

        // Exit edit mode on Shift+Enter or Ctrl/Cmd+Enter
        const disposable = editor.addAction({
            id: 'save-markdown',
            label: 'Save Markdown',
            keybindings: [
                monaco.KeyMod.Shift | monaco.KeyCode.Enter,
                monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter
            ],
            run: () => {
                setIsEditing(false);
                if ((monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter)) {
                    onAddBelow();
                }
            }
        });

        return () => disposable?.dispose();
    };

    const toggleEdit = () => {
        setIsEditing(!isEditing);
        if (!isEditing) {
            onSelect();
        }
    };

    // Action button component matching CodeCell
    const ActionButton = ({ onClick, icon: Icon, tooltip, danger = false, primary = false }) => (
        <Tooltip content={tooltip} placement="left" delay={300}>
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

    // Custom markdown components with modern styling
    const components = {
        h1: ({ children }) => (
            <h1 className="text-3xl font-bold mb-6 mt-4 pb-2 border-b-2 border-zinc-700 bg-gradient-to-r from-white to-blue-400 bg-clip-text text-transparent">
                {children}
            </h1>
        ),
        h2: ({ children }) => (
            <h2 className="text-2xl font-semibold mb-4 mt-3 pb-1 border-b border-zinc-800 text-white">
                {children}
            </h2>
        ),
        h3: ({ children }) => <h3 className="text-xl font-semibold mb-3 mt-2 text-white">{children}</h3>,
        h4: ({ children }) => <h4 className="text-lg font-medium mb-2 mt-2 text-white">{children}</h4>,
        h5: ({ children }) => <h5 className="text-base font-medium mb-2 mt-1 text-gray-300">{children}</h5>,
        h6: ({ children }) => <h6 className="text-sm font-medium mb-1 mt-1 text-gray-300">{children}</h6>,
        p: ({ children }) => <p className="mb-4 leading-relaxed text-gray-300">{children}</p>,
        ul: ({ children }) => <ul className="list-disc list-inside mb-4 space-y-1 text-gray-300">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal list-inside mb-4 space-y-1 text-gray-300">{children}</ol>,
        li: ({ children }) => <li className="ml-2">{children}</li>,
        blockquote: ({ children }) => (
            <blockquote className="pl-4 py-2 mb-4 italic border-l-4 border-blue-500 bg-zinc-800/40 text-gray-300">
                {children}
            </blockquote>
        ),
        code: ({ inline, children }) =>
            inline ? (
                <code className="px-1.5 py-0.5 rounded text-sm font-mono bg-zinc-800 text-green-400 border border-zinc-700">
                    {children}
                </code>
            ) : (
                <code className="block p-4 rounded-lg mb-4 text-sm font-mono overflow-x-auto bg-black text-blue-400 border border-zinc-700">
                    {children}
                </code>
            ),
        pre: ({ children }) => (
            <pre className="p-4 rounded-lg mb-4 overflow-x-auto bg-black border border-zinc-700">
                {children}
            </pre>
        ),
        a: ({ href, children }) => (
            <a
                href={href}
                className="underline decoration-dotted underline-offset-2 hover:decoration-solid transition-all text-blue-400"
                target="_blank"
                rel="noopener noreferrer"
            >
                {children}
            </a>
        ),
        hr: () => <hr className="my-6 border-zinc-700" />,
        table: ({ children }) => (
            <div className="overflow-x-auto mb-4">
                <table className="min-w-full" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
                    {children}
                </table>
            </div>
        ),
        thead: ({ children }) => (
            <thead className="bg-zinc-800">{children}</thead>
        ),
        tbody: ({ children }) => <tbody>{children}</tbody>,
        tr: ({ children }) => (
            <tr className="border-b border-zinc-700">{children}</tr>
        ),
        th: ({ children }) => (
            <th className="px-4 py-2 text-left font-semibold text-white">
                {children}
            </th>
        ),
        td: ({ children }) => (
            <td className="px-4 py-2 text-gray-300">
                {children}
            </td>
        ),
    };

    const [toolbarVisible, setToolbarVisible] = useState(false);

    return (
        <div
            className="group/cell relative"
            onMouseEnter={() => setToolbarVisible(true)}
            onMouseLeave={(e) => {
                // Check if mouse is leaving to the toolbar
                const rect = e.currentTarget.getBoundingClientRect();
                const isLeavingToToolbar = e.clientX < rect.left && e.clientX >= rect.left - 96;
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
            >
                    <ActionButton
                        onClick={toggleEdit}
                        icon={isEditing ? CheckIcon : PencilIcon}
                        primary
                        tooltip={
                            <div>
                                {isEditing ? 'Save' : 'Edit'}
                                <KeyboardShortcut keys={isEditing ? ['shift', 'enter'] : ['double-click']} />
                            </div>
                        }
                    />

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
                    ${isEditing ? 'bg-gradient-to-r from-zinc-900 to-zinc-800 border-l-blue-500'
                        : 'bg-zinc-900 border-l-gray-500'}
                    ${isSelected ? 'shadow-xl translate-x-1' : 'shadow-md translate-x-0'}
                `}
                onClick={onSelect}
                onDoubleClick={() => !isEditing && toggleEdit()}
            >
                {/* Content */}
                {isEditing && !isMovingCells ? (
                    <div className="min-h-[120px]">
                        <Editor
                            height={Math.max(120, (cell.content.split('\n').length + 1) * 20)}
                            language="markdown"
                            theme="markdown-modern"
                            value={cell.content}
                            onChange={(value) => updateCell(cell.id, { content: value || '' })}
                            onMount={handleEditorDidMount}
                            beforeMount={(monaco) => {
                                // Define theme only once, before any editor mounts
                                try {
                                    monaco.editor.defineTheme('markdown-modern', {
                                        base: 'vs-dark',
                                        inherit: true,
                                        rules: [
                                            { token: 'keyword', foreground: 'c792ea' },
                                            { token: 'string', foreground: 'c3e88d' },
                                            { token: 'emphasis', fontStyle: 'italic' },
                                            { token: 'strong', fontStyle: 'bold' },
                                        ],
                                        colors: {
                                            'editor.background': '#18181bee',
                                            'editor.foreground': '#ffffff',
                                            'editor.lineHighlightBackground': '#27272a40',
                                            'editorCursor.foreground': '#3b82f6',
                                            'editor.selectionBackground': '#3b82f630',
                                        }
                                    });
                                } catch (e) {
                                    // Theme might already be registered
                                }
                                monaco.editor.setTheme('markdown-modern');
                            }}
                            options={{
                                minimap: { enabled: false },
                                lineNumbers: 'off',
                                glyphMargin: false,
                                folding: false,
                                lineDecorationsWidth: 0,
                                renderLineHighlight: 'none',
                                scrollBeyondLastLine: false,
                                fontSize: 14,
                                fontFamily: 'Inter, -apple-system, sans-serif',
                                automaticLayout: true,
                                wordWrap: 'on',
                                padding: { top: 20, bottom: 20 },
                                overviewRulerLanes: 0,
                                hideCursorInOverviewRuler: true,
                                overviewRulerBorder: false,
                                scrollbar: {
                                    vertical: 'auto',
                                    horizontal: 'hidden',
                                    useShadows: false,
                                    verticalSliderSize: 6,
                                },
                                cursorBlinking: 'smooth',
                                smoothScrolling: true,
                            }}
                        />
                    </div>
                ) : isMovingCells ? (
                    <div className="px-8 py-6 min-h-[60px] flex items-center justify-center">
                        <div className="text-gray-500">Moving cells...</div>
                    </div>
                ) : (
                    <div className="px-8 py-6 min-h-[60px]">
                        {cell.content ? (
                            <div className="prose prose-invert max-w-none">
                                <ReactMarkdown
                                    remarkPlugins={[remarkGfm, remarkMath]}
                                    rehypePlugins={[rehypeKatex]}
                                    components={components}
                                >
                                    {cell.content}
                                </ReactMarkdown>
                            </div>
                        ) : (
                            <div className="italic text-gray-500">
                                Double-click to edit...
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}