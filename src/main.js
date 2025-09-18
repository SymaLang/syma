import '../app.css';
import { boot } from "./runtime.js";
import universe from 'virtual:syma-universe';

// Boot the application with the bundled universe
const app = await boot(universe, '#app');

// Hot Module Replacement support
if (import.meta.hot) {
    import.meta.hot.accept('virtual:syma-universe', async (newModule) => {
        console.log('[HMR] Reloading Syma modules...');
        // Re-boot with the new universe
        if (newModule) {
            await boot(newModule.default || newModule, '#app');
        }
    });
}