import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { nanoid } from 'nanoid';
import { getNotebookEngine } from './notebook-engine';

export const CellType = {
    CODE: 'code',
    MARKDOWN: 'markdown'
};

export const CellStatus = {
    IDLE: 'idle',
    RUNNING: 'running',
    SUCCESS: 'success',
    ERROR: 'error'
};

const createCell = (type, content = '') => ({
    id: nanoid(),
    type,
    content,
    outputs: [],
    status: CellStatus.IDLE,
    executionCount: null,
    metadata: {}
});

// Default initial cells
const getInitialCells = () => [
    createCell(CellType.MARKDOWN, '# Syma Notebook\n\nWelcome to the Syma interactive notebook. You can write and execute Syma code, and document your work with markdown, similar to Jupyter Notebook.\n\n## Tips\n- Use `:import` to load stdlib modules (e.g., `:import Core/List`)\n- Use `:render` to create interactive UI components\n- Multiple commands can be in one cell (each on its own line)\n- For complex multiline content, use `:rule multiline`, `:render multiline`, or `:add multiline` ... `:end` syntax'),
    createCell(CellType.CODE, '; Example: Simple arithmetic\n{Add 1 2}'),
    createCell(CellType.CODE, '; Example: Multiline rule definition\n:rule multiline\nCounter\n  Apply(Inc, State({Count n_}))\n  ->\n  State({Count Add(n_, 1)})\n:end'),
    createCell(CellType.CODE, '; Example: Multiline UI rendering\n:render multiline\n{Div\n  :class "card"\n  {H1 "Interactive Counter"}\n  {P "Click to increment: " {Show Count}}\n  {Button\n    :onClick Inc\n    :class "btn btn-primary"\n    "Click Me!"\n  }\n}\n:end')
];

export const useNotebookStore = create(
    persist(
        (set, get) => ({
    cells: getInitialCells(),
    selectedCellId: null,
    executionCount: 0,
    isMovingCells: false,
    metadata: {
        name: 'Untitled',
        created: new Date().toISOString(),
        modified: new Date().toISOString(),
        kernelName: 'syma',
        languageInfo: {
            name: 'syma',
            version: '1.0.0',
            fileExtension: '.syma',
            mimeType: 'text/x-syma'
        }
    },

    // Notification system
    notifications: [],
    deletedCells: [], // Stack of deleted cells for undo

    // Cell operations
    addCell: (type, afterId = null, position = 'after') => set(state => {
        const newCell = createCell(type);
        const cells = [...state.cells];

        if (afterId === null && position === 'before') {
            // Insert at the beginning when explicitly requested
            cells.unshift(newCell);
        } else if (afterId) {
            // Insert after the specified cell
            const index = cells.findIndex(c => c.id === afterId);
            cells.splice(index + 1, 0, newCell);
        } else {
            // Default: append to the end
            cells.push(newCell);
        }

        return {
            cells,
            selectedCellId: newCell.id,
            metadata: { ...state.metadata, modified: new Date().toISOString() }
        };
    }),

    deleteCell: (id) => {
        const state = get();
        const cellToDelete = state.cells.find(c => c.id === id);
        const cellIndex = state.cells.findIndex(c => c.id === id);

        if (!cellToDelete) return;

        // Clean up engine resources for this cell
        const engine = getNotebookEngine();
        engine.cleanupCell(id);

        // Store deleted cell with its position for undo
        const deletedCellData = {
            cell: cellToDelete,
            index: cellIndex,
            timestamp: Date.now()
        };

        return set(state => {
            const notificationId = nanoid();
            const cellType = cellToDelete.type === CellType.MARKDOWN ? 'Markdown' : 'Code';

            return {
                cells: state.cells.filter(c => c.id !== id),
                selectedCellId: state.selectedCellId === id ? null : state.selectedCellId,
                metadata: { ...state.metadata, modified: new Date().toISOString() },
                // Keep only the last 10 deleted cells to prevent memory issues
                deletedCells: [...state.deletedCells.slice(-9), deletedCellData],
                notifications: [...state.notifications, {
                    id: notificationId,
                    type: 'info',
                    message: `${cellType} cell deleted`,
                    action: {
                        label: 'Undo',
                        handler: () => get().undoDeleteCell(deletedCellData)
                    },
                    timeout: 8000, // Extended to 8 seconds
                    createdAt: Date.now()
                }]
            };
        });
    },

    undoDeleteCell: (deletedCellData) => set(state => {
        const { cell, index } = deletedCellData;
        const newCells = [...state.cells];

        // Insert the cell back at its original position (or at the end if index is out of bounds)
        const insertIndex = Math.min(index, newCells.length);
        newCells.splice(insertIndex, 0, cell);

        return {
            cells: newCells,
            selectedCellId: cell.id,
            deletedCells: state.deletedCells.filter(d => d !== deletedCellData),
            metadata: { ...state.metadata, modified: new Date().toISOString() }
        };
    }),

    addNotification: (notification) => set(state => ({
        notifications: [...state.notifications, {
            id: nanoid(),
            createdAt: Date.now(),
            timeout: 8000, // Default to 8 seconds
            ...notification
        }]
    })),

    removeNotification: (id) => set(state => ({
        notifications: state.notifications.filter(n => n.id !== id)
    })),

    clearOldNotifications: () => set(state => {
        const now = Date.now();
        const activeNotifications = state.notifications.filter(n => {
            // Keep notifications that haven't exceeded their timeout
            // or have no timeout (manual dismiss only)
            if (!n.timeout) return true;
            return (now - n.createdAt) < n.timeout;
        });

        // Only update state if notifications actually changed
        if (activeNotifications.length === state.notifications.length) {
            return state; // No change, don't trigger re-render
        }

        return { notifications: activeNotifications };
    }),

    updateCell: (id, updates) => set(state => ({
        cells: state.cells.map(c =>
            c.id === id ? { ...c, ...updates } : c
        ),
        metadata: { ...state.metadata, modified: new Date().toISOString() }
    })),

    moveCell: (id, direction) => {
        // Set moving flag
        set({ isMovingCells: true });

        // Delay the actual move to allow editors to unmount
        setTimeout(() => {
            set(state => {
                const cells = [...state.cells];
                const index = cells.findIndex(c => c.id === id);

                if (direction === 'up' && index > 0) {
                    [cells[index - 1], cells[index]] = [cells[index], cells[index - 1]];
                } else if (direction === 'down' && index < cells.length - 1) {
                    [cells[index], cells[index + 1]] = [cells[index + 1], cells[index]];
                }

                return {
                    cells,
                    metadata: { ...state.metadata, modified: new Date().toISOString() }
                };
            });

            // Clear moving flag after move completes
            setTimeout(() => set({ isMovingCells: false }), 0);
        }, 0);
    },

    selectCell: (id) => set({ selectedCellId: id }),

    // Execution
    setCellStatus: (id, status) => set(state => ({
        cells: state.cells.map(c =>
            c.id === id ? { ...c, status } : c
        )
    })),

    setCellOutput: (id, outputs) => set(state => {
        const executionCount = state.executionCount + 1;
        return {
            cells: state.cells.map(c =>
                c.id === id
                    ? { ...c, outputs, executionCount, status: CellStatus.SUCCESS }
                    : c
            ),
            executionCount
        };
    }),

    setCellError: (id, error) => set(state => ({
        cells: state.cells.map(c =>
            c.id === id
                ? {
                    ...c,
                    outputs: [{ type: 'error', content: error }],
                    status: CellStatus.ERROR
                }
                : c
        )
    })),

    // Clear outputs
    clearCellOutput: (id) => set(state => ({
        cells: state.cells.map(c =>
            c.id === id ? { ...c, outputs: [], executionCount: null, status: CellStatus.IDLE } : c
        )
    })),

    clearAllOutputs: () => set(state => ({
        cells: state.cells.map(c => ({
            ...c,
            outputs: [],
            executionCount: null,
            status: CellStatus.IDLE
        }))
    })),

    // Notebook operations
    updateMetadata: (updates) => set(state => ({
        metadata: { ...state.metadata, ...updates, modified: new Date().toISOString() }
    })),

    setNotebook: (notebook) => set({
        cells: notebook.cells || [],
        metadata: { ...notebook.metadata, modified: new Date().toISOString() },
        executionCount: 0,
        selectedCellId: null
    }),

    getNotebook: () => {
        const state = get();
        return {
            metadata: state.metadata,
            cells: state.cells.map(({ id, type, content, outputs, metadata }) => ({
                id,
                type,
                content,
                outputs,
                metadata
            }))
        };
    },

    newNotebook: () => set({
        cells: [createCell(CellType.CODE, '')],
        selectedCellId: null,
        executionCount: 0,
        notifications: [],
        deletedCells: [],
        metadata: {
            name: 'Untitled',
            created: new Date().toISOString(),
            modified: new Date().toISOString(),
            kernelName: 'syma',
            languageInfo: {
                name: 'syma',
                version: '1.0.0',
                fileExtension: '.syma',
                mimeType: 'text/x-syma'
            }
        }
    })
        }),
        {
            name: 'syma-notebook-storage',
            // Custom storage wrapper with error handling
            storage: {
                getItem: (name) => {
                    try {
                        const str = localStorage.getItem(name);
                        return str ? JSON.parse(str) : null;
                    } catch (error) {
                        console.error('Failed to load notebook state:', error);
                        return null;
                    }
                },
                setItem: (name, value) => {
                    try {
                        localStorage.setItem(name, JSON.stringify(value));
                    } catch (error) {
                        if (error.name === 'QuotaExceededError') {
                            console.warn('localStorage quota exceeded. Clearing old data and retrying...');
                            // Try clearing old data and retry once
                            try {
                                // Clear other storage items but keep the notebook
                                const keysToKeep = ['syma-notebook-storage'];
                                for (let i = localStorage.length - 1; i >= 0; i--) {
                                    const key = localStorage.key(i);
                                    if (key && !keysToKeep.includes(key)) {
                                        localStorage.removeItem(key);
                                    }
                                }
                                // Try again with cleaned storage
                                localStorage.setItem(name, JSON.stringify(value));
                            } catch (retryError) {
                                console.error('Failed to save notebook even after cleanup:', retryError);
                                // Silently fail - notebook will continue working but without persistence
                            }
                        } else {
                            console.error('Failed to save notebook state:', error);
                        }
                    }
                },
                removeItem: (name) => {
                    localStorage.removeItem(name);
                }
            },
            // Only persist cells and metadata, not temporary state
            partialize: (state) => ({
                cells: state.cells.map(cell => ({
                    ...cell,
                    // Filter out DOM outputs, volatile outputs, and very large outputs
                    outputs: cell.outputs.filter(output => {
                        // Skip DOM outputs
                        if (output.type === 'dom') return false;
                        // Skip volatile outputs (like trace)
                        if (output.volatile) return false;
                        // Skip outputs larger than 100KB to prevent quota issues
                        if (output.content && output.content.length > 100000) return false;
                        return true;
                    }).map(output => {
                        // Truncate any remaining large outputs just in case
                        if (output.content && output.content.length > 50000) {
                            return {
                                ...output,
                                content: output.content.substring(0, 50000) + '\n\n[Output truncated for storage...]'
                            };
                        }
                        return output;
                    })
                })),
                metadata: state.metadata
            }),
            // Merge persisted state with fresh defaults
            merge: (persisted, current) => ({
                ...current,
                cells: persisted?.cells || getInitialCells(),
                metadata: persisted?.metadata || current.metadata
            })
        }
    )
);