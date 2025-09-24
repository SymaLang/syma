import React, { useRef, useState } from 'react';
import {
    PlayIcon,
    DocumentArrowDownIcon,
    DocumentArrowUpIcon,
    PlusIcon,
    TrashIcon,
    ArrowPathIcon,
    CodeBracketIcon,
    DocumentTextIcon,
    DocumentPlusIcon,
    SparklesIcon,
    MoonIcon,
    SunIcon
} from '@heroicons/react/24/outline';
import { useNotebookStore, CellType } from '../notebook-store';
import { saveNotebook, loadNotebook } from '../notebook-io';
import { Tooltip, KeyboardShortcut } from './Tooltip';
import { clearNotebookAccordionStates } from '../utils/accordion-state';
// Design tokens removed - using Tailwind classes directly

export function NotebookToolbar({ onRunAll }) {
    const fileInputRef = useRef(null);
    const nameInputRef = useRef(null);
    const [theme, setTheme] = useState('dark');
    const [isEditingName, setIsEditingName] = useState(false);
    const [tempName, setTempName] = useState('');
    const {
        metadata,
        cells,
        addCell,
        clearAllOutputs,
        newNotebook,
        getNotebook,
        setNotebook,
        updateMetadata
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
            // Clear accordion states for the current notebook before loading new one
            clearNotebookAccordionStates(metadata.id);
            setNotebook(notebook);
        } catch (error) {
            console.error('Failed to load notebook:', error);
            // TODO: Show toast notification
        }

        event.target.value = '';
    };

    const handleNew = () => {
        if (cells.length > 0 && !confirm('Create a new notebook? All unsaved changes will be lost.')) {
            return;
        }
        // Clear accordion states for the current notebook before creating new one
        clearNotebookAccordionStates(metadata.id);
        newNotebook();
    };

    const handleRestart = () => {
        if (!confirm('Restart kernel? All variables and state will be lost.')) {
            return;
        }
        clearAllOutputs();
        const { getNotebookEngine } = require('../notebook-engine');
        const engine = getNotebookEngine();
        engine.reset();
    };

    const handleStartEditName = () => {
        setTempName(metadata.name || 'Untitled');
        setIsEditingName(true);
        setTimeout(() => {
            nameInputRef.current?.select();
        }, 0);
    };

    const handleSaveName = () => {
        const newName = tempName.trim() || 'Untitled';
        updateMetadata({ name: newName });
        setIsEditingName(false);
    };

    const handleCancelEditName = () => {
        setIsEditingName(false);
        setTempName('');
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSaveName();
        } else if (e.key === 'Escape') {
            handleCancelEditName();
        }
    };

    const ToolbarButton = ({ onClick, icon: Icon, tooltip, primary = false, danger = false, disabled = false }) => {
        const buttonClasses = `
            relative p-2.5 rounded transition-all duration-200
            ${primary ? 'bg-gradient-to-br from-blue-500 to-blue-600 border-blue-500 text-white'
                : danger ? 'bg-zinc-800/80 border-zinc-700 text-gray-400 hover:bg-red-950 hover:border-red-500 hover:text-white'
                : 'bg-zinc-800/80 border-zinc-700 text-gray-400 hover:bg-zinc-700 hover:border-zinc-600 hover:text-white'}
            ${!disabled ? 'transform hover:scale-105 active:scale-95' : ''}
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
            border
        `.replace(/\s+/g, ' ').trim();

        return (
            <Tooltip content={tooltip} placement="bottom" delay={500}>
                <button
                    onClick={onClick}
                    disabled={disabled}
                    className={buttonClasses}
                >
                    <Icon className="w-5 h-5" />
                </button>
            </Tooltip>
        );
    };

    return (
        <div className="fixed top-0 left-0 right-0 z-200 bg-zinc-900/85 backdrop-blur-xl border-b border-zinc-800">
            <div className="max-w-7xl mx-auto px-6">
                <div className="flex items-center justify-between h-16">
                    {/* Logo and Title */}
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg shadow-blue-500/20">
                                <SparklesIcon className="w-5 h-5 text-white" />
                            </div>
                            <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                                Syma Notebook
                            </h1>
                        </div>

                        <div className="flex items-center gap-2 px-3 py-1.5 rounded">
                            {isEditingName ? (
                                <input
                                    ref={nameInputRef}
                                    type="text"
                                    value={tempName}
                                    onChange={(e) => setTempName(e.target.value)}
                                    onBlur={handleSaveName}
                                    onKeyDown={handleKeyDown}
                                    className="text-lg bg-transparent border-b border-blue-500 outline-none text-white px-1 min-w-[100px]"
                                    placeholder="Notebook name"
                                    autoFocus
                                />
                            ) : (
                                <button
                                    onClick={handleStartEditName}
                                    className="text-lg text-gray-400 hover:text-white transition-colors cursor-text px-1"
                                    title="Click to edit name"
                                >
                                    {metadata.name || 'Untitled'}
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Toolbar Actions */}
                    <div className="flex items-center gap-3">
                        {/* File operations */}
                        <div className="flex items-center gap-1.5 px-2 py-1">
                            <ToolbarButton
                                onClick={handleNew}
                                icon={DocumentPlusIcon}
                                tooltip={
                                    <div>
                                        New notebook
                                        {/*<KeyboardShortcut keys={['cmd', 'n']} />*/}
                                    </div>
                                }
                            />
                            <ToolbarButton
                                onClick={handleLoad}
                                icon={DocumentArrowUpIcon}
                                tooltip="Open notebook"
                            />
                            <ToolbarButton
                                onClick={handleSave}
                                icon={DocumentArrowDownIcon}
                                tooltip={
                                    <div>
                                        Save notebook
                                        {/*<KeyboardShortcut keys={['cmd', 's']} />*/}
                                    </div>
                                }
                            />
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".symnb,.json"
                                onChange={handleFileLoad}
                                className="hidden"
                            />
                        </div>

                        {/* Vertical separator */}
                        <div className="w-px h-6 bg-zinc-700" />

                        {/* Cell operations */}
                        <div className="flex items-center gap-1.5 px-2 py-1">
                            <ToolbarButton
                                onClick={() => addCell(CellType.CODE, cells[cells.length - 1]?.id)}
                                icon={CodeBracketIcon}
                                tooltip="Add code cell"
                            />
                            <ToolbarButton
                                onClick={() => addCell(CellType.MARKDOWN, cells[cells.length - 1]?.id)}
                                icon={DocumentTextIcon}
                                tooltip="Add markdown cell"
                            />
                        </div>

                        <div className="w-px h-6 bg-zinc-700" />

                        {/* Run controls */}
                        <div className="flex items-center gap-1.5 px-2 py-1">
                            <ToolbarButton
                                onClick={onRunAll}
                                icon={PlayIcon}
                                primary
                                tooltip={
                                    <div>
                                        Run all cells
                                        <KeyboardShortcut keys={['cmd', 'shift', 'enter']} />
                                    </div>
                                }
                            />
                            <ToolbarButton
                                onClick={clearAllOutputs}
                                icon={TrashIcon}
                                tooltip="Clear all outputs"
                            />
                            <ToolbarButton
                                onClick={handleRestart}
                                icon={ArrowPathIcon}
                                tooltip="Restart kernel"
                                danger
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}