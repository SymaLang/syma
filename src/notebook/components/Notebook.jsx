import React, { useEffect, useRef, useCallback } from 'react';
import { useNotebookStore, CellType } from '../notebook-store';
import { CodeCell } from './CodeCell';
import { MarkdownCell } from './MarkdownCell';
import { NotebookToolbar } from './NotebookToolbar';
import { getNotebookEngine } from '../notebook-engine';

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
        <div className="min-h-screen bg-black text-white">
            <NotebookToolbar onRunAll={runAllCells} />

            <div className="max-w-6xl mx-auto px-4 pb-20" ref={notebookRef}>
                <div className="pt-20 pl-24 pr-8">
                    {cells.length === 0 ? (
                        <div className="text-center py-20">
                            <p className="text-gray-500 mb-4">No cells yet. Add one to get started.</p>
                            <div className="flex gap-4 justify-center">
                                <button
                                    onClick={() => addCell(CellType.CODE)}
                                    className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded transition"
                                >
                                    Add Code Cell
                                </button>
                                <button
                                    onClick={() => addCell(CellType.MARKDOWN)}
                                    className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded transition"
                                >
                                    Add Markdown Cell
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {cells.map(cell => {
                                const CellComponent = cell.type === CellType.CODE ? CodeCell : MarkdownCell;
                                return (
                                    <div key={cell.id} className="relative isolate">
                                        <CellComponent
                                            cell={cell}
                                            isSelected={cell.id === selectedCellId}
                                            onSelect={() => selectCell(cell.id)}
                                            onAddBelow={() => handleAddCellBelow(cell.id)}
                                        />
                                    </div>
                                );
                            })}

                            {/* Add cell button at the bottom */}
                            <div className="flex justify-center py-4">
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => addCell(CellType.CODE, cells[cells.length - 1]?.id)}
                                        className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 rounded text-sm transition"
                                        title="Add code cell (B)"
                                    >
                                        + Code
                                    </button>
                                    <button
                                        onClick={() => addCell(CellType.MARKDOWN, cells[cells.length - 1]?.id)}
                                        className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 rounded text-sm transition"
                                        title="Add markdown cell"
                                    >
                                        + Markdown
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Keyboard shortcuts help */}
            <div className="fixed bottom-4 right-4 text-xs text-gray-600">
                <details>
                    <summary className="cursor-pointer hover:text-gray-400">Keyboard Shortcuts</summary>
                    <div className="bg-neutral-900 border border-gray-800 rounded p-3 mt-2 text-gray-400">
                        <div className="space-y-1">
                            <div><kbd>Shift+Enter</kbd> Run cell</div>
                            <div><kbd>Ctrl+Enter</kbd> Run cell and add below</div>
                            <div><kbd>A</kbd> Add cell above</div>
                            <div><kbd>B</kbd> Add cell below</div>
                            <div><kbd>M</kbd> Convert to markdown</div>
                            <div><kbd>Y</kbd> Convert to code</div>
                            <div><kbd>↑/↓</kbd> Navigate cells</div>
                        </div>
                    </div>
                </details>
            </div>
        </div>
    );
}