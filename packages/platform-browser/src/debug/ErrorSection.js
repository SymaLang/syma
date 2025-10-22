/*****************************************************************
 * Error Section
 *
 * Displays runtime errors in a Vite/React-style error overlay
 ******************************************************************/

export class ErrorSection {
    constructor() {
        this.errors = [];
    }

    addError(error) {
        const errorInfo = {
            message: error.message || String(error),
            stack: error.stack || '',
            timestamp: new Date().toISOString(),
            type: error.name || 'Error'
        };

        this.errors.unshift(errorInfo); // Add to beginning

        // Keep only last 10 errors
        if (this.errors.length > 10) {
            this.errors = this.errors.slice(0, 10);
        }
    }

    clearErrors() {
        this.errors = [];
    }

    hasErrors() {
        return this.errors.length > 0;
    }

    getLatestError() {
        return this.errors[0] || null;
    }

    render() {
        // Don't render anything if there are no errors
        if (this.errors.length === 0) {
            return null;
        }

        const section = document.createElement('div');
        section.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 12px;
        `;

        // Header
        const header = document.createElement('div');
        header.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
        `;

        const title = document.createElement('h3');
        title.textContent = `⚠️ Errors (${this.errors.length})`;
        title.style.cssText = `
            margin: 0;
            font-size: 14px;
            font-weight: bold;
            color: #f85149;
        `;

        header.appendChild(title);

        const clearBtn = document.createElement('button');
        clearBtn.textContent = 'Clear';
        clearBtn.style.cssText = `
            background: #30363d;
            border: 1px solid #444;
            color: #8b949e;
            padding: 4px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 11px;
            transition: all 0.2s;
        `;

        clearBtn.addEventListener('mouseenter', () => {
            clearBtn.style.background = '#3d4449';
            clearBtn.style.color = '#f0f6fc';
        });

        clearBtn.addEventListener('mouseleave', () => {
            clearBtn.style.background = '#30363d';
            clearBtn.style.color = '#8b949e';
        });

        clearBtn.addEventListener('click', () => {
            this.clearErrors();
            // Notify overlay to update everything
            if (window.__symaDebugOverlay) {
                window.__symaDebugOverlay.updateBadge();
                window.__symaDebugOverlay.updateContent();
            }
        });

        header.appendChild(clearBtn);
        section.appendChild(header);

        // Error list
        this.errors.forEach((error, index) => {
            const errorEl = this.renderError(error, index);
            section.appendChild(errorEl);
        });

        return section;
    }

    renderError(error, index) {
        const errorBox = document.createElement('div');
        errorBox.style.cssText = `
            background: rgba(248, 81, 73, 0.1);
            border: 1px solid rgba(248, 81, 73, 0.4);
            border-radius: 6px;
            padding: 12px;
            font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
        `;

        // Error header with type and time
        const errorHeader = document.createElement('div');
        errorHeader.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
            font-size: 11px;
        `;

        const errorType = document.createElement('span');
        errorType.textContent = error.type;
        errorType.style.cssText = `
            color: #f85149;
            font-weight: bold;
        `;

        const errorTime = document.createElement('span');
        const time = new Date(error.timestamp);
        errorTime.textContent = time.toLocaleTimeString();
        errorTime.style.cssText = `
            color: #8b949e;
            font-size: 10px;
        `;

        errorHeader.appendChild(errorType);
        errorHeader.appendChild(errorTime);
        errorBox.appendChild(errorHeader);

        // Error message
        const messageEl = document.createElement('div');
        messageEl.textContent = error.message;
        messageEl.style.cssText = `
            color: #f85149;
            font-size: 13px;
            line-height: 1.5;
            margin-bottom: 8px;
            word-wrap: break-word;
        `;
        errorBox.appendChild(messageEl);

        // Stack trace (collapsible)
        if (error.stack) {
            const stackToggle = document.createElement('details');
            stackToggle.style.cssText = `
                margin-top: 8px;
                cursor: pointer;
            `;

            const stackSummary = document.createElement('summary');
            stackSummary.textContent = 'Stack Trace';
            stackSummary.style.cssText = `
                color: #8b949e;
                font-size: 11px;
                margin-bottom: 8px;
                cursor: pointer;
                user-select: none;
            `;

            const stackContent = document.createElement('pre');
            stackContent.textContent = this.formatStackTrace(error.stack);
            stackContent.style.cssText = `
                margin: 0;
                padding: 8px;
                background: rgba(0, 0, 0, 0.3);
                border-radius: 4px;
                font-size: 10px;
                color: #e1e4e8;
                overflow-x: auto;
                white-space: pre-wrap;
                word-wrap: break-word;
            `;

            stackToggle.appendChild(stackSummary);
            stackToggle.appendChild(stackContent);
            errorBox.appendChild(stackToggle);
        }

        return errorBox;
    }

    formatStackTrace(stack) {
        // Parse and format stack trace to highlight file locations
        const lines = stack.split('\n');

        // Skip the first line if it's just the error message
        const stackLines = lines.filter(line =>
            line.trim().startsWith('at ') ||
            line.includes('.js:') ||
            line.includes('.ts:')
        );

        return stackLines.join('\n').trim();
    }
}
