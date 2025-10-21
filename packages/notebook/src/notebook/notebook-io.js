// Notebook I/O functions for saving and loading

export function saveNotebook(notebook) {
    const filename = `${notebook.metadata.name || 'notebook'}_${new Date().toISOString().slice(0, 10)}.symnb`;
    const data = JSON.stringify(notebook, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export async function loadNotebook(file) {
    const text = await file.text();
    const notebook = JSON.parse(text);

    // Validate notebook structure
    if (!notebook.metadata || !Array.isArray(notebook.cells)) {
        throw new Error('Invalid notebook format');
    }

    // Ensure all cells have required fields
    notebook.cells = notebook.cells.map(cell => ({
        id: cell.id || generateId(),
        type: cell.type || 'code',
        content: cell.content || '',
        outputs: cell.outputs || [],
        status: 'idle',
        executionCount: null,
        metadata: cell.metadata || {}
    }));

    return notebook;
}

// Generate a simple ID
function generateId() {
    return Math.random().toString(36).substr(2, 9);
}

// Export notebook to Syma file
export function exportToSyma(notebook) {
    let symaContent = '; Syma Notebook Export\n';
    symaContent += `; Generated: ${new Date().toISOString()}\n`;
    symaContent += `; Name: ${notebook.metadata.name || 'Untitled'}\n\n`;

    notebook.cells.forEach((cell, index) => {
        if (cell.type === 'markdown') {
            // Convert markdown to comments
            symaContent += `\n;; Cell ${index + 1} (Markdown)\n`;
            cell.content.split('\n').forEach(line => {
                symaContent += `; ${line}\n`;
            });
        } else if (cell.type === 'code') {
            symaContent += `\n;; Cell ${index + 1} (Code)\n`;
            symaContent += cell.content;
            if (!cell.content.endsWith('\n')) {
                symaContent += '\n';
            }
        }
    });

    return symaContent;
}

// Import from Syma file
export function importFromSyma(symaContent) {
    const lines = symaContent.split('\n');
    const cells = [];
    let currentCell = null;
    let inMarkdownCell = false;

    for (const line of lines) {
        // Detect cell markers
        if (line.match(/^;; Cell \d+ \(Markdown\)/)) {
            if (currentCell) {
                cells.push(currentCell);
            }
            currentCell = {
                type: 'markdown',
                content: '',
                outputs: [],
                metadata: {}
            };
            inMarkdownCell = true;
        } else if (line.match(/^;; Cell \d+ \(Code\)/)) {
            if (currentCell) {
                cells.push(currentCell);
            }
            currentCell = {
                type: 'code',
                content: '',
                outputs: [],
                metadata: {}
            };
            inMarkdownCell = false;
        } else if (currentCell) {
            if (inMarkdownCell && line.startsWith('; ')) {
                // Remove comment marker and add to markdown
                currentCell.content += line.substring(2) + '\n';
            } else if (!inMarkdownCell && !line.startsWith(';;')) {
                // Add to code cell
                currentCell.content += line + '\n';
            }
        }
    }

    // Add last cell
    if (currentCell) {
        cells.push(currentCell);
    }

    // Clean up content
    cells.forEach(cell => {
        cell.content = cell.content.trim();
    });

    return {
        metadata: {
            name: 'Imported from Syma',
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
        cells: cells.filter(cell => cell.content) // Remove empty cells
    };
}