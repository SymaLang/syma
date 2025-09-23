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
        // Clean up engine resources for this cell
        const engine = getNotebookEngine();
        engine.cleanupCell(id);

        return set(state => ({
            cells: state.cells.filter(c => c.id !== id),
            selectedCellId: state.selectedCellId === id ? null : state.selectedCellId,
            metadata: { ...state.metadata, modified: new Date().toISOString() }
        }));
    },

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
            // Only persist cells and metadata, not temporary state
            partialize: (state) => ({
                cells: state.cells.map(cell => ({
                    ...cell,
                    // Filter out DOM outputs that can't be serialized
                    outputs: cell.outputs.filter(output => output.type !== 'dom')
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