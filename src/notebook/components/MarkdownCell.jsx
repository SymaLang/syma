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
    PlusIcon
} from '@heroicons/react/24/outline';
import { useNotebookStore } from '../notebook-store';
import 'katex/dist/katex.min.css';

export function MarkdownCell({ cell, isSelected, onSelect, onAddBelow }) {
    const [isEditing, setIsEditing] = useState(false);
    const editorRef = useRef(null);
    const { updateCell, deleteCell, moveCell } = useNotebookStore();

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
        const disposable = editor.onKeyDown((e) => {
            if ((e.shiftKey || e.ctrlKey || e.metaKey) && e.code === 'Enter') {
                e.preventDefault();
                setIsEditing(false);
                if (e.ctrlKey || e.metaKey) {
                    onAddBelow();
                }
            }
        });

        return () => disposable.dispose();
    };

    const toggleEdit = () => {
        setIsEditing(!isEditing);
        if (!isEditing) {
            onSelect();
        }
    };

    // Custom components for markdown rendering
    const components = {
        h1: ({ children }) => <h1 className="text-3xl font-bold text-white mb-4 mt-2">{children}</h1>,
        h2: ({ children }) => <h2 className="text-2xl font-bold text-white mb-3 mt-2">{children}</h2>,
        h3: ({ children }) => <h3 className="text-xl font-bold text-white mb-2 mt-2">{children}</h3>,
        h4: ({ children }) => <h4 className="text-lg font-bold text-white mb-2 mt-1">{children}</h4>,
        h5: ({ children }) => <h5 className="text-base font-bold text-white mb-1 mt-1">{children}</h5>,
        h6: ({ children }) => <h6 className="text-sm font-bold text-white mb-1 mt-1">{children}</h6>,
        p: ({ children }) => <p className="text-gray-300 mb-3 leading-relaxed">{children}</p>,
        ul: ({ children }) => <ul className="list-disc list-inside mb-3 text-gray-300">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal list-inside mb-3 text-gray-300">{children}</ol>,
        li: ({ children }) => <li className="mb-1">{children}</li>,
        blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-gray-600 pl-4 italic text-gray-400 mb-3">
                {children}
            </blockquote>
        ),
        code: ({ inline, children }) =>
            inline ? (
                <code className="bg-neutral-800 px-1 py-0.5 rounded text-sm text-green-400">{children}</code>
            ) : (
                <code className="block bg-black p-3 rounded mb-3 text-sm text-green-400 overflow-x-auto">{children}</code>
            ),
        pre: ({ children }) => (
            <pre className="bg-black p-3 rounded mb-3 overflow-x-auto">{children}</pre>
        ),
        a: ({ href, children }) => (
            <a href={href} className="text-blue-400 hover:text-blue-300 underline" target="_blank" rel="noopener noreferrer">
                {children}
            </a>
        ),
        hr: () => <hr className="border-gray-700 my-4" />,
        table: ({ children }) => (
            <div className="overflow-x-auto mb-3">
                <table className="min-w-full border border-gray-700">{children}</table>
            </div>
        ),
        thead: ({ children }) => <thead className="bg-neutral-800">{children}</thead>,
        tbody: ({ children }) => <tbody>{children}</tbody>,
        tr: ({ children }) => <tr className="border-b border-gray-700">{children}</tr>,
        th: ({ children }) => <th className="px-4 py-2 text-left text-white">{children}</th>,
        td: ({ children }) => <td className="px-4 py-2 text-gray-300">{children}</td>,
    };

    return (
        <div className="group/cell relative">
            <div
                className={`relative bg-neutral-900 transition-all ${
                    isSelected ? 'ring-2 ring-blue-500/50' : ''
                }`}
                onClick={onSelect}
                onDoubleClick={() => !isEditing && toggleEdit()}
            >
                {/* Cell toolbar - visible on cell hover OR toolbar hover */}
                <div className="absolute -left-20 top-0 flex flex-col gap-1 opacity-0 group-hover/cell:opacity-100 hover:opacity-100 transition-opacity z-20 overflow-visible">
                    <button
                    onClick={toggleEdit}
                    className="p-1.5 bg-neutral-800 hover:bg-neutral-700 rounded text-gray-400 hover:text-white"
                    title={isEditing ? 'Save (Shift+Enter)' : 'Edit'}
                >
                    {isEditing ? (
                        <CheckIcon className="w-4 h-4" />
                    ) : (
                        <PencilIcon className="w-4 h-4" />
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

            {/* Content */}
            {isEditing ? (
                <div className="min-h-[100px]">
                    <Editor
                        height={Math.max(100, (cell.content.split('\n').length + 1) * 20)}
                        language="markdown"
                        theme="vs-dark"
                        value={cell.content}
                        onChange={(value) => updateCell(cell.id, { content: value || '' })}
                        onMount={handleEditorDidMount}
                        options={{
                            minimap: { enabled: false },
                            lineNumbers: 'off',
                            glyphMargin: false,
                            folding: false,
                            lineDecorationsWidth: 0,
                            renderLineHighlight: 'none',
                            scrollBeyondLastLine: false,
                            fontSize: 14,
                            fontFamily: 'JetBrains Mono, Monaco, Consolas, monospace',
                            automaticLayout: true,
                            wordWrap: 'on',
                            padding: { top: 10, bottom: 10, left: 20, right: 20 },
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
            ) : (
                <div className="px-6 py-4 min-h-[40px]">
                    {cell.content ? (
                        <ReactMarkdown
                            remarkPlugins={[remarkGfm, remarkMath]}
                            rehypePlugins={[rehypeKatex]}
                            components={components}
                        >
                            {cell.content}
                        </ReactMarkdown>
                    ) : (
                        <div className="text-gray-500 italic">Double-click to edit...</div>
                    )}
                </div>
            )}
            </div>
        </div>
    );
}