import React, { useState } from 'react';
import { PlusIcon, CodeBracketIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import { useNotebookStore, CellType } from '../notebook-store';

export function CellDivider({ afterCellId }) {
    const [isHovered, setIsHovered] = useState(false);
    const [showButtons, setShowButtons] = useState(false);
    const { addCell } = useNotebookStore();

    const handleAddCode = () => {
        addCell(CellType.CODE, afterCellId, afterCellId === null ? 'before' : 'after');
        setShowButtons(false);
        setIsHovered(false);
    };

    const handleAddMarkdown = () => {
        addCell(CellType.MARKDOWN, afterCellId, afterCellId === null ? 'before' : 'after');
        setShowButtons(false);
        setIsHovered(false);
    };

    return (
        <div
            className="relative h-4 -my-2 group"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => {
                setIsHovered(false);
                setShowButtons(false);
            }}
        >
            {/* Hover area and line */}
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-8 flex items-center justify-center">
                <div className={`
                    w-full relative
                    ${isHovered ? 'h-[2px] bg-blue-500/50' : 'h-[1px] bg-transparent'}
                `}>
                    {/* Center button */}
                    {isHovered && !showButtons && (
                        <button
                            onClick={() => setShowButtons(true)}
                            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 p-1.5 rounded-lg bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 hover:border-zinc-600 transition-all duration-200 hover:scale-110"
                            title="Insert cell"
                        >
                            <PlusIcon className="w-4 h-4 text-gray-400" />
                        </button>
                    )}

                    {/* Cell type buttons */}
                    {showButtons && (
                        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800/95 backdrop-blur border border-zinc-700 shadow-xl">
                            <span className="text-xs text-gray-500 mr-1">Insert:</span>
                            <button
                                onClick={handleAddCode}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-700 hover:bg-zinc-600 border border-zinc-600 hover:border-zinc-500 transition-colors"
                                title="Insert code cell"
                            >
                                <CodeBracketIcon className="w-4 h-4 text-blue-400" />
                                <span className="text-xs text-gray-300">Code</span>
                            </button>
                            <button
                                onClick={handleAddMarkdown}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-700 hover:bg-zinc-600 border border-zinc-600 hover:border-zinc-500 transition-colors"
                                title="Insert markdown cell"
                            >
                                <DocumentTextIcon className="w-4 h-4 text-green-400" />
                                <span className="text-xs text-gray-300">Markdown</span>
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}