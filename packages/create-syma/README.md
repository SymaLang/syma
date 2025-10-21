# create-syma

Scaffolding tool for Syma applications with Vite.

## Usage

### With npm

```bash
npm create syma@latest my-app
cd my-app
npm install
npm run dev
```

### With pnpm

```bash
pnpm create syma my-app
cd my-app
pnpm install
pnpm dev
```

### With yarn

```bash
yarn create syma my-app
cd my-app
yarn
yarn dev
```

## Templates

### default
A simple counter application demonstrating:
- Basic UI rendering with Syma's declarative syntax
- State management through rewrite rules
- Event handling with symbolic actions

### counter (coming soon)
An enhanced counter with more features and examples.

## Project Structure

The scaffolded project includes:

```
my-app/
├── src/
│   ├── modules/         # Syma module files (.syma)
│   │   └── main.syma    # Main application module
│   └── main.js          # JavaScript entry point
├── index.html           # HTML template
├── vite.config.js       # Vite configuration with Syma plugin
├── package.json
└── README.md
```

## What's Included

- **@syma/platform-browser** - Browser runtime for Syma
- **@syma/vite-plugin** - Vite plugin for Syma module compilation and HMR
- **@syma/cli** - Syma compiler and REPL tools
- **Vite** - Fast development server and build tool

## Next Steps

After creating your project:

1. **Explore the main.syma file** - This is your application's entry point
2. **Modify the rules** - Change how the UI responds to actions
3. **Add new modules** - Create additional .syma files in `src/modules/`
4. **Learn Syma** - Check out the [documentation](https://github.com/ahineya/syma)

## Features

- ⚡️ Hot Module Replacement (HMR) for .syma files
- 🎯 Symbolic programming with pattern matching
- 🔄 Automatic module bundling and dependency resolution
- 🎨 Declarative UI rendering
- 🛠️ Full TypeScript-like development experience

## License

MIT
