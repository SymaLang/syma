import { create } from 'zustand';
import { nanoid } from 'nanoid';

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

export const useNotebookStore = create((set, get) => ({
    cells: [
        createCell(CellType.MARKDOWN, '# Syma Notebook\n\nWelcome to the Syma interactive notebook. You can write and execute Syma code, and document your work with markdown.'),
        createCell(CellType.CODE, '; Example: Simple arithmetic\n(+ 1 2 3)')
    ],
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
    },

    // Cell operations
    addCell: (type, afterId = null) => set(state => {
        const newCell = createCell(type);
        const cells = [...state.cells];

        if (afterId) {
            const index = cells.findIndex(c => c.id === afterId);
            cells.splice(index + 1, 0, newCell);
        } else {
            cells.push(newCell);
        }

        return {
            cells,
            selectedCellId: newCell.id,
            metadata: { ...state.metadata, modified: new Date().toISOString() }
        };
    }),

    deleteCell: (id) => set(state => ({
        cells: state.cells.filter(c => c.id !== id),
        selectedCellId: state.selectedCellId === id ? null : state.selectedCellId,
        metadata: { ...state.metadata, modified: new Date().toISOString() }
    })),

    updateCell: (id, updates) => set(state => ({
        cells: state.cells.map(c =>
            c.id === id ? { ...c, ...updates } : c
        ),
        metadata: { ...state.metadata, modified: new Date().toISOString() }
    })),

    moveCell: (id, direction) => set(state => {
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
    }),

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
}));