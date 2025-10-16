/*****************************************************************
 * Debug Overlay
 *
 * Main debug overlay UI component that coordinates all debug sections
 ******************************************************************/

import { ProgramSection } from './ProgramSection.js';
import { RulesSection } from './RulesSection.js';

export class DebugOverlay {
    constructor(options = {}) {
        this.parser = options.parser || null;
        this.getUniverse = options.getUniverse || (() => null);
        this.visible = false;
        this.overlay = null;
        this.toggleButton = null;
        this.content = null;

        // Initialize sections
        this.programSection = new ProgramSection(this.parser, this.getUniverse);
        this.rulesSection = new RulesSection(this.parser, this.getUniverse);

        this.init();
        this.restoreState();
    }

    saveState() {
        try {
            localStorage.setItem('syma-debug-overlay-visible', JSON.stringify(this.visible));
        } catch (e) {
            // Silently fail if localStorage is not available
            console.warn('Failed to save debug overlay state:', e);
        }
    }

    restoreState() {
        try {
            const savedState = localStorage.getItem('syma-debug-overlay-visible');
            if (savedState !== null) {
                const wasVisible = JSON.parse(savedState);
                if (wasVisible) {
                    // Restore the visible state
                    this.show();
                }
            }
        } catch (e) {
            // Silently fail if localStorage is not available
            console.warn('Failed to restore debug overlay state:', e);
        }
    }

    init() {
        this.createToggleButton();
        this.createOverlay();
    }

    createToggleButton() {
        this.toggleButton = document.createElement('button');
        this.toggleButton.innerHTML = '🛠️';
        this.toggleButton.title = 'Toggle Debug Overlay (Ctrl+D / Cmd+D)';
        this.toggleButton.style.cssText = `
            position: fixed;
            top: 16px;
            right: 16px;
            width: 48px;
            height: 48px;
            border-radius: 50%;
            background: linear-gradient(135deg, #58a6ff 0%, #1f6feb 100%);
            border: 2px solid rgba(88, 166, 255, 0.3);
            color: white;
            font-size: 20px;
            cursor: pointer;
            z-index: 9999;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 0;
            outline: none;
        `;

        this.toggleButton.addEventListener('mouseenter', () => {
            this.toggleButton.style.transform = 'scale(1.1)';
            this.toggleButton.style.boxShadow = '0 6px 16px rgba(88, 166, 255, 0.4)';
        });

        this.toggleButton.addEventListener('mouseleave', () => {
            this.toggleButton.style.transform = 'scale(1)';
            this.toggleButton.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
        });

        this.toggleButton.addEventListener('click', () => this.toggle());

        document.body.appendChild(this.toggleButton);
    }

    createOverlay() {
        this.overlay = document.createElement('div');
        this.overlay.id = 'syma-debug-overlay';
        this.overlay.style.cssText = `
            position: fixed;
            top: 0;
            right: 0;
            width: 500px;
            height: 100vh;
            background: rgba(26, 26, 26, 0.98);
            border-left: 2px solid #444;
            color: #e1e4e8;
            font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
            font-size: 12px;
            z-index: 10000;
            transform: translateX(100%);
            transition: transform 0.3s ease-in-out;
            box-shadow: -4px 0 16px rgba(0, 0, 0, 0.3);
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
        `;

        // Header
        const header = this.createHeader();
        this.overlay.appendChild(header);

        // Content area
        this.content = document.createElement('div');
        this.content.style.cssText = `
            flex: 1;
            overflow-y: auto;
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 24px;
        `;
        this.overlay.appendChild(this.content);

        document.body.appendChild(this.overlay);

        // Keyboard shortcut
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
                e.preventDefault();
                this.toggle();
            }
        });
    }

    createHeader() {
        const header = document.createElement('div');
        header.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 16px 16px 12px 16px;
            border-bottom: 1px solid #444;
            flex-shrink: 0;
        `;

        const title = document.createElement('h2');
        title.textContent = '🔍 Syma Debug';
        title.style.cssText = `
            margin: 0;
            font-size: 18px;
            color: #58a6ff;
            font-weight: bold;
        `;

        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✕';
        closeBtn.style.cssText = `
            background: none;
            border: none;
            color: #8b949e;
            font-size: 20px;
            cursor: pointer;
            padding: 0;
            width: 24px;
            height: 24px;
            line-height: 24px;
            text-align: center;
            border-radius: 4px;
            transition: all 0.2s;
        `;

        closeBtn.addEventListener('mouseenter', () => {
            closeBtn.style.background = '#30363d';
            closeBtn.style.color = '#f0f6fc';
        });

        closeBtn.addEventListener('mouseleave', () => {
            closeBtn.style.background = 'none';
            closeBtn.style.color = '#8b949e';
        });

        closeBtn.addEventListener('click', () => this.hide());

        header.appendChild(title);
        header.appendChild(closeBtn);

        return header;
    }

    show() {
        this.visible = true;
        this.overlay.style.transform = 'translateX(0)';
        this.updateContent();

        if (this.toggleButton) {
            this.toggleButton.style.background = 'linear-gradient(135deg, #1f6feb 0%, #0969da 100%)';
            this.toggleButton.style.borderColor = 'rgba(88, 166, 255, 0.6)';
        }

        // Save state to localStorage
        this.saveState();
    }

    hide() {
        this.visible = false;
        this.overlay.style.transform = 'translateX(100%)';

        if (this.toggleButton) {
            this.toggleButton.style.background = 'linear-gradient(135deg, #58a6ff 0%, #1f6feb 100%)';
            this.toggleButton.style.borderColor = 'rgba(88, 166, 255, 0.3)';
        }

        // Save state to localStorage
        this.saveState();
    }

    toggle() {
        if (this.visible) {
            this.hide();
        } else {
            this.show();
        }
    }

    onUniverseUpdate() {
        if (this.visible) {
            this.updateContent();
        }
    }

    updateContent() {
        if (!this.parser || !this.getUniverse) {
            this.content.innerHTML = '<span style="color: #f85149;">Parser or universe not available</span>';
            return;
        }

        const universe = this.getUniverse();
        if (!universe) {
            this.content.innerHTML = '<span style="color: #f85149;">Universe not loaded</span>';
            return;
        }

        // Clear and rebuild content
        this.content.innerHTML = '';

        // Render sections
        const programEl = this.programSection.render();
        this.content.appendChild(programEl);

        const rulesEl = this.rulesSection.render();
        this.content.appendChild(rulesEl);
    }

    cleanup() {
        if (this.overlay && this.overlay.parentNode) {
            this.overlay.parentNode.removeChild(this.overlay);
        }
        if (this.toggleButton && this.toggleButton.parentNode) {
            this.toggleButton.parentNode.removeChild(this.toggleButton);
        }
    }
}
