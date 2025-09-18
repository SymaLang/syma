import '../app.css';
import { boot } from "./runtime.js";
import universe from "./bf.lisp";

// Boot the application with the imported universe
const app = await boot(universe, '#app');

// Hot Module Replacement support
if (import.meta.hot) {
    import.meta.hot.accept('./bf.lisp', async (newModule) => {
        console.log('[HMR] Updating bf.lisp...');
        // Re-boot with the new universe
        if (newModule) {
            await boot(newModule.default || newModule, '#app');
        }
    });
}