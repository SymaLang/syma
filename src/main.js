import { boot } from "./runtime.js";
import universe from "./todo.lisp";

// Boot the application with the imported universe
const app = await boot(universe, '#app');

// Hot Module Replacement support
if (import.meta.hot) {
    import.meta.hot.accept('./todo.lisp', async (newModule) => {
        console.log('[HMR] Updating todo.lisp...');
        // Re-boot with the new universe
        if (newModule) {
            await boot(newModule.default || newModule, '#app');
        }
    });
}