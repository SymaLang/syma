import React, { useEffect, useRef, useCallback } from 'react';
import { useNotebookStore, CellType } from '../notebook-store';
import { CodeCell } from './CodeCell';
import { MarkdownCell } from './MarkdownCell';
import { NotebookToolbar } from './NotebookToolbar';
import { getNotebookEngine } from '../notebook-engine';
// Design tokens removed - using Tailwind classes directly
import { PlusIcon, CodeBracketIcon, DocumentTextIcon } from '@heroicons/react/24/outline';

export function Notebook() {
    const {
        cells,
        selectedCellId,
        selectCell,
        addCell,
        clearAllOutputs
    } = useNotebookStore();

    const notebookRef = useRef(null);
    const engineRef = useRef(null);

    // Initialize notebook engine
    useEffect(() => {
        engineRef.current = getNotebookEngine();
        engineRef.current.initialize();

        return () => {
            if (engineRef.current) {
                engineRef.current.dispose();
            }
        };
    }, []);

    // Handle keyboard shortcuts at notebook level
    useEffect(() => {
        const handleKeyDown = (e) => {
            // Only handle if not in an editor
            const target = e.target;
            const isInEditor = target.closest('.monaco-editor') !== null;

            if (!isInEditor) {
                // A: Add cell above
                if (e.key === 'a' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
                    e.preventDefault();
                    const index = selectedCellId ? cells.findIndex(c => c.id === selectedCellId) : cells.length;
                    const beforeId = index > 0 ? cells[index - 1].id : null;
                    addCell(CellType.CODE, beforeId);
                }
                // B: Add cell below
                else if (e.key === 'b' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
                    e.preventDefault();
                    addCell(CellType.CODE, selectedCellId);
                }
                // M: Convert to markdown
                else if (e.key === 'm' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
                    e.preventDefault();
                    if (selectedCellId) {
                        const cell = cells.find(c => c.id === selectedCellId);
                        if (cell && cell.type === CellType.CODE) {
                            useNotebookStore.getState().updateCell(selectedCellId, { type: CellType.MARKDOWN });
                        }
                    }
                }
                // Y: Convert to code
                else if (e.key === 'y' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
                    e.preventDefault();
                    if (selectedCellId) {
                        const cell = cells.find(c => c.id === selectedCellId);
                        if (cell && cell.type === CellType.MARKDOWN) {
                            useNotebookStore.getState().updateCell(selectedCellId, { type: CellType.CODE });
                        }
                    }
                }
                // Arrow keys for navigation
                else if (e.key === 'ArrowUp' && !e.shiftKey) {
                    e.preventDefault();
                    const index = cells.findIndex(c => c.id === selectedCellId);
                    if (index > 0) {
                        selectCell(cells[index - 1].id);
                    }
                }
                else if (e.key === 'ArrowDown' && !e.shiftKey) {
                    e.preventDefault();
                    const index = cells.findIndex(c => c.id === selectedCellId);
                    if (index < cells.length - 1) {
                        selectCell(cells[index + 1].id);
                    }
                }
            }

            // Global shortcuts (work even in editor)
            // Ctrl/Cmd+Shift+P: Command palette (future feature)
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'p') {
                e.preventDefault();
                console.log('Command palette not yet implemented');
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [cells, selectedCellId, selectCell, addCell]);

    // Run all cells
    const runAllCells = useCallback(async () => {
        for (const cell of cells) {
            if (cell.type === CellType.CODE && cell.content.trim()) {
                useNotebookStore.getState().setCellStatus(cell.id, 'running');

                const engine = engineRef.current;
                if (cell.content.trim().startsWith(':')) {
                    const { outputs, hasError } = await engine.executeCommand(cell.id, cell.content.trim());
                    if (hasError) {
                        useNotebookStore.getState().setCellError(cell.id, outputs[0]?.content || 'Unknown error');
                    } else {
                        useNotebookStore.getState().setCellOutput(cell.id, outputs);
                    }
                } else {
                    const { outputs, hasError } = await engine.executeCode(cell.id, cell.content);
                    if (hasError) {
                        useNotebookStore.getState().setCellError(cell.id, outputs[0]?.content || 'Unknown error');
                    } else {
                        useNotebookStore.getState().setCellOutput(cell.id, outputs);
                    }
                }

                useNotebookStore.getState().setCellStatus(cell.id, 'idle');
            }
        }
    }, [cells]);

    const handleAddCellBelow = useCallback((afterId) => {
        addCell(CellType.CODE, afterId);
    }, [addCell]);

    return (
        <div className="min-h-screen bg-black">
            <NotebookToolbar onRunAll={runAllCells} />

            <div className="max-w-7xl mx-auto pb-20" ref={notebookRef}>
                <div className="pt-24 pl-32 pr-8">
                    {cells.length === 0 ? (
                        <div className="text-center py-32">
                            <p className="text-lg mb-8 text-gray-500">
                                Start by adding a cell to your notebook
                            </p>
                            <div className="flex gap-4 justify-center">
                                <button
                                    onClick={() => addCell(CellType.CODE)}
                                    className="flex items-center gap-3 px-6 py-3 rounded-xl transition-all bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/20 hover:scale-105 active:scale-95"
                                >
                                    <CodeBracketIcon className="w-5 h-5" />
                                    Add Code Cell
                                </button>
                                <button
                                    onClick={() => addCell(CellType.MARKDOWN)}
                                    className="flex items-center gap-3 px-6 py-3 rounded-xl transition-all bg-zinc-800 border border-zinc-700 text-gray-300 hover:bg-zinc-700 hover:border-zinc-600 hover:scale-105 active:scale-95"
                                >
                                    <DocumentTextIcon className="w-5 h-5" />
                                    Add Markdown Cell
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {cells.map((cell, index) => {
                                const CellComponent = cell.type === CellType.CODE ? CodeCell : MarkdownCell;
                                return (
                                    <CellComponent
                                        key={cell.id}
                                        cell={cell}
                                        isSelected={cell.id === selectedCellId}
                                        onSelect={() => selectCell(cell.id)}
                                        onAddBelow={() => handleAddCellBelow(cell.id)}
                                    />
                                );
                            })}

                            {/* Add cell button at the bottom */}
                            <div className="flex justify-center py-8">
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => addCell(CellType.CODE, cells[cells.length - 1]?.id)}
                                        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all bg-zinc-900 border border-zinc-700 text-gray-400 hover:bg-blue-500 hover:border-blue-500 hover:text-white hover:scale-105 active:scale-95"
                                    >
                                        <PlusIcon className="w-4 h-4" />
                                        Code
                                    </button>
                                    <button
                                        onClick={() => addCell(CellType.MARKDOWN, cells[cells.length - 1]?.id)}
                                        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all bg-zinc-900 border border-zinc-700 text-gray-400 hover:bg-zinc-700 hover:border-zinc-600 hover:text-white hover:scale-105 active:scale-95"
                                    >
                                        <PlusIcon className="w-4 h-4" />
                                        Markdown
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

        </div>
    );
}