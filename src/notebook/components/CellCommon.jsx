import React, { useState } from 'react';
import {
    TrashIcon,
    ChevronUpIcon,
    ChevronDownIcon,
    PlusIcon
} from '@heroicons/react/24/outline';
import { Tooltip, KeyboardShortcut } from './Tooltip';
import { useNotebookStore } from '../notebook-store';

// Shared ActionButton component
export const ActionButton = ({ onClick, icon: Icon, tooltip, danger = false, primary = false }) => (
    <Tooltip content={tooltip} placement="right" delay={300}>
        <button
            onClick={onClick}
            className={`
                relative p-2 rounded-lg
                ${primary ? 'bg-blue-500 text-white'
                    : danger ? 'bg-red-950 text-gray-400 hover:bg-red-800 hover:text-white'
                    : 'bg-zinc-700 text-gray-400 hover:bg-zinc-700 hover:text-white'}
            `}
        >
            <Icon className="w-4 h-4" />
        </button>
    </Tooltip>
);

// Shared toolbar wrapper with hover logic
export const CellToolbar = ({ children, visible, onVisibilityChange }) => {
    return (
        <div
            className={`absolute -left-24 top-0 z-[100] flex flex-col gap-1.5 p-1.5 rounded-lg bg-zinc-800/85 backdrop-blur border border-zinc-700 transition-opacity duration-200 ${
                visible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
            }`}
            onMouseEnter={() => onVisibilityChange(true)}
            onMouseLeave={() => onVisibilityChange(false)}
        >
            {children}
        </div>
    );
};

// Common cell control buttons
export const CellControls = ({ cellId, onAddBelow }) => {
    const moveCell = useNotebookStore(state => state.moveCell);
    const deleteCell = useNotebookStore(state => state.deleteCell);

    return (
        <>
            <div className="flex flex-col gap-1">
                <ActionButton
                    onClick={() => moveCell(cellId, 'up')}
                    icon={ChevronUpIcon}
                    tooltip="Move up"
                />
                <ActionButton
                    onClick={() => moveCell(cellId, 'down')}
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
                    onClick={() => deleteCell(cellId)}
                    icon={TrashIcon}
                    danger
                    tooltip="Delete cell"
                />
            </div>
        </>
    );
};

// Hook for managing toolbar visibility
export const useToolbarVisibility = () => {
    const [toolbarVisible, setToolbarVisible] = useState(false);

    const handleMouseEnter = () => setToolbarVisible(true);
    
    const handleMouseLeave = (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const isLeavingToToolbar = e.clientX < rect.left && e.clientX >= rect.left - 96;
        if (!isLeavingToToolbar) {
            setToolbarVisible(false);
        }
    };

    return {
        toolbarVisible,
        setToolbarVisible,
        handleMouseEnter,
        handleMouseLeave
    };
};