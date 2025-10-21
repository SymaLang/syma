# @syma/vite-plugin

Vite plugin for Syma module compilation with Hot Module Replacement (HMR).

## Installation

```bash
npm install -D @syma/vite-plugin @syma/cli
npm install @syma/platform-browser
```

## Usage

Add the plugin to your `vite.config.js`:

```js
import { defineConfig } from 'vite';
import symaPlugin from '@syma/vite-plugin';

export default defineConfig({
  plugins: [
    symaPlugin({
      entryModule: 'App/Main',
      modulesDir: 'src/modules'
    })
  ]
});
```

## Options

### `entryModule`
- **Type:** `string`
- **Default:** `'App/Main'`

The name of the entry module to bundle. This should match the module name in your .syma file.

### `entryFile`
- **Type:** `string`
- **Default:** `null`

Path to a specific .syma file to use as entry. When provided, overrides `entryModule`. The plugin will automatically extract the module name from the file.

### `modulesDir`
- **Type:** `string`
- **Default:** `'src/modules'`

Directory where .syma module files are located.

### `pretty`
- **Type:** `boolean`
- **Default:** `true`

Whether to pretty-print the compiled JSON output.

### `include`
- **Type:** `RegExp`
- **Default:** `/\.syma$/`

Files to include for HMR watching.

### `exclude`
- **Type:** `RegExp`
- **Default:** `/node_modules/`

Files to exclude from HMR watching.

## How It Works

The plugin:

1. **Scans** all .syma files in `modulesDir` and standard library
2. **Resolves** dependencies by parsing Import declarations
3. **Bundles** all modules using the Syma compiler
4. **Provides** a virtual module `virtual:syma-universe` with the compiled AST
5. **Watches** for changes and triggers HMR updates

## Virtual Module

Import the compiled universe in your JavaScript entry point:

```js
import { boot } from '@syma/platform-browser/runtime';
import universe from 'virtual:syma-universe';

boot(universe, '#app', 'dom', { debug: false });
```

## Hot Module Replacement

The plugin automatically watches .syma files and triggers full page reloads when changes are detected. For smoother HMR:

```js
boot(universe, '#app', 'dom', { debug: false })
  .then((app) => {
    if (import.meta.hot) {
      import.meta.hot.accept('virtual:syma-universe', (newModule) => {
        if (newModule) {
          app.reload();
        }
      });
    }
  });
```

## Environment Variables

You can override the entry file using an environment variable:

```bash
VITE_SYMA_ENTRY=src/demos/counter.syma npm run dev
```

## Module Resolution

The plugin supports both name-based and file-based imports:

```lisp
; Name-based (searches in modulesDir and stdlib)
{Import Core/List as List}

; File-based (relative to current module)
{Import Utils/Helpers as H from "./helpers.syma"}
```

## Error Handling

The plugin provides helpful error messages when:
- Entry module is not found
- Module files are malformed
- Compilation fails

Errors are displayed both in the terminal and in the browser during development.

## License

MIT
