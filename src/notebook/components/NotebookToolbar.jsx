import React, { useRef } from 'react';
import {
    PlayIcon,
    DocumentArrowDownIcon,
    DocumentArrowUpIcon,
    PlusIcon,
    TrashIcon,
    ArrowPathIcon,
    Bars3Icon,
    CodeBracketIcon,
    DocumentTextIcon
} from '@heroicons/react/24/outline';
import { useNotebookStore, CellType } from '../notebook-store';
import { saveNotebook, loadNotebook } from '../notebook-io';

export function NotebookToolbar({ onRunAll }) {
    const fileInputRef = useRef(null);
    const {
        metadata,
        cells,
        addCell,
        clearAllOutputs,
        newNotebook,
        getNotebook,
        setNotebook
    } = useNotebookStore();

    const handleSave = () => {
        const notebook = getNotebook();
        saveNotebook(notebook);
    };

    const handleLoad = () => {
        fileInputRef.current?.click();
    };

    const handleFileLoad = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        try {
            const notebook = await loadNotebook(file);
            setNotebook(notebook);
        } catch (error) {
            console.error('Failed to load notebook:', error);
            alert('Failed to load notebook. Please check the file format.');
        }

        // Reset input
        event.target.value = '';
    };

    const handleNew = () => {
        if (cells.length > 0 && !confirm('Create a new notebook? All unsaved changes will be lost.')) {
            return;
        }
        newNotebook();
    };

    const handleRestart = () => {
        if (!confirm('Restart kernel? All variables and state will be lost.')) {
            return;
        }
        clearAllOutputs();
        // Reset the engine universe
        const { getNotebookEngine } = require('../notebook-engine');
        const engine = getNotebookEngine();
        engine.reset();
    };

    return (
        <div className="fixed top-0 left-0 right-0 bg-neutral-900 border-b border-gray-800 z-10">
            <div className="max-w-6xl mx-auto px-4">
                <div className="flex items-center justify-between h-14">
                    <div className="flex items-center gap-4">
                        <h1 className="text-lg font-bold text-white">Syma Notebook</h1>
                        <div className="text-sm text-gray-500">
                            {metadata.name || 'Untitled'}
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* File operations */}
                        <div className="flex gap-1 border-r border-gray-700 pr-2 mr-2">
                            <button
                                onClick={handleNew}
                                className="p-2 hover:bg-neutral-800 rounded transition"
                                title="New notebook"
                            >
                                <DocumentTextIcon className="w-4 h-4" />
                            </button>
                            <button
                                onClick={handleLoad}
                                className="p-2 hover:bg-neutral-800 rounded transition"
                                title="Open notebook"
                            >
                                <DocumentArrowUpIcon className="w-4 h-4" />
                            </button>
                            <button
                                onClick={handleSave}
                                className="p-2 hover:bg-neutral-800 rounded transition"
                                title="Save notebook (Ctrl+S)"
                            >
                                <DocumentArrowDownIcon className="w-4 h-4" />
                            </button>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".symnb,.json"
                                onChange={handleFileLoad}
                                className="hidden"
                            />
                        </div>

                        {/* Cell operations */}
                        <div className="flex gap-1 border-r border-gray-700 pr-2 mr-2">
                            <button
                                onClick={() => addCell(CellType.CODE)}
                                className="p-2 hover:bg-neutral-800 rounded transition"
                                title="Add code cell"
                            >
                                <CodeBracketIcon className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => addCell(CellType.MARKDOWN)}
                                className="p-2 hover:bg-neutral-800 rounded transition"
                                title="Add markdown cell"
                            >
                                <Bars3Icon className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Run controls */}
                        <div className="flex gap-1 border-r border-gray-700 pr-2 mr-2">
                            <button
                                onClick={onRunAll}
                                className="p-2 hover:bg-neutral-800 rounded transition flex items-center gap-1"
                                title="Run all cells"
                            >
                                <PlayIcon className="w-4 h-4" />
                                <span className="text-xs">Run All</span>
                            </button>
                            <button
                                onClick={clearAllOutputs}
                                className="p-2 hover:bg-neutral-800 rounded transition"
                                title="Clear all outputs"
                            >
                                <TrashIcon className="w-4 h-4" />
                            </button>
                            <button
                                onClick={handleRestart}
                                className="p-2 hover:bg-neutral-800 rounded transition"
                                title="Restart kernel"
                            >
                                <ArrowPathIcon className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Status indicator */}
                        <div className="flex items-center gap-2 text-xs">
                            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                            <span className="text-gray-500">Ready</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}