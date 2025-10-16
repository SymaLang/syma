// Main entry point - conditionally loads notebook or demo runtime

// Check if we're in syma development mode (with specific entry file)
const isSymaDev = import.meta.env.VITE_SYMA_ENTRY !== undefined;

// Check if we're in demo mode (pre-built universe.json)
const isDemo = import.meta.env.VITE_DEMO_MODE === 'true' ||
                window.location.search.includes('demo=true') ||
                window.location.pathname.includes('/demo');

if (isSymaDev || isDemo) {
  // Load Syma runtime (either dev with HMR or demo mode)
  import('./main-syma.js');
} else {
  // Load React notebook app
  import('react').then(React => {
    import('react-dom/client').then(ReactDOM => {
      import('./App').then(AppModule => {
        const App = AppModule.default;
        const root = ReactDOM.createRoot(document.getElementById('app'));
        root.render(
          React.createElement(React.StrictMode, null,
            React.createElement(App)
          )
        );
      });
    });
  });
}