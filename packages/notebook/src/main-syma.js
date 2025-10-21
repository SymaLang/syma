import '../app.css';
import { boot } from "@syma/platform-browser/runtime";

// Check if we're in demo mode (pre-built universe.json, no HMR)
const isDemo = import.meta.env.VITE_DEMO_MODE === 'true' ||
                window.location.search.includes('demo=true') ||
                window.location.pathname.includes('/demo');

// Check if we're in syma dev mode (specific entry file with HMR)
const isSymaDev = import.meta.env.VITE_SYMA_ENTRY !== undefined;

// Check if debug mode is enabled via URL parameter
const urlParams = new URLSearchParams(window.location.search);
const isDebugMode = urlParams.has('debug');

async function startApp() {
    let universe;

    if (isDemo && !isSymaDev) {
        // In demo mode without syma dev, load from the pre-built public/universe.json
        console.log('[Syma] Loading demo from universe.json...');
        const response = await fetch('/universe.json');
        universe = await response.json();
    } else {
        // In development mode (with or without specific entry), use the virtual module with HMR
        const entryFile = import.meta.env.VITE_SYMA_ENTRY;
        console.log(entryFile
            ? `[Syma] Loading from ${entryFile} with HMR...`
            : '[Syma] Loading from virtual module with HMR...');
        const module = await import('virtual:syma-universe');
        universe = module.default;
    }

    // Boot the application with the universe
    const app = await boot(universe, '#app', 'dom', { debug: isDebugMode });

    // Hot Module Replacement support (only when using virtual module)
    if (!isDemo || isSymaDev) {
        if (import.meta.hot) {
            import.meta.hot.accept('virtual:syma-universe', async (newModule) => {
                console.log('[HMR] Reloading Syma modules...');
                // Re-boot with the new universe, preserving debug mode
                if (newModule) {
                    await boot(newModule.default || newModule, '#app', 'dom', { debug: isDebugMode });
                }
            });
        }
    }

    // Initialize debug overlay if enabled
    if (isDebugMode && app.debugOverlay) {
        console.log('[Syma] Debug overlay enabled - press Ctrl+D to toggle');
    }

    return app;
}

// Start the application
startApp().catch(console.error);