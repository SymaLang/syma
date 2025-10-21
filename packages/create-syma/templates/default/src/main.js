import { boot } from '@syma/platform-browser/runtime';
import universe from 'virtual:syma-universe';
import './styles.css';

// Boot the Syma application
boot(universe, '#app', 'dom', { debug: import.meta.env.DEV })
  .then((app) => {
    console.log('Syma app initialized');
    if (import.meta.hot) {
      import.meta.hot.accept('virtual:syma-universe', (newModule) => {
        if (newModule) {
          app.reload();
        }
      });
    }
  })
  .catch((error) => {
    console.error('Failed to initialize Syma app:', error);
  });
