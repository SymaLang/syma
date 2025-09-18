import '../app.css';
import { boot } from "./runtime.js";

// Check if we're in demo mode (set by environment or URL)
const isDemo = import.meta.env.VITE_DEMO_MODE === 'true' ||
                window.location.search.includes('demo=true') ||
                window.location.pathname.includes('/demo');

async function startApp() {
    let universe;

    if (isDemo) {
        // In demo mode, load from the pre-built public/universe.json
        console.log('[Syma] Loading demo from universe.json...');
        const response = await fetch('/universe.json');
        universe = await response.json();
    } else {
        // In development mode, use the virtual module with HMR
        console.log('[Syma] Loading from virtual module...');
        const module = await import('virtual:syma-universe');
        universe = module.default;
    }

    // Boot the application with the universe
    const app = await boot(universe, '#app');

    // Hot Module Replacement support (only for non-demo mode)
    if (!isDemo && import.meta.hot) {
        import.meta.hot.accept('virtual:syma-universe', async (newModule) => {
            console.log('[HMR] Reloading Syma modules...');
            // Re-boot with the new universe
            if (newModule) {
                await boot(newModule.default || newModule, '#app');
            }
        });
    }

    return app;
}

// Start the application
startApp().catch(console.error);