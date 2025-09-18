# Syma Projector Architecture

## Overview

The projector architecture provides a modular way to render symbolic UI representations to different output formats. This allows the same symbolic program to be rendered to DOM, text traces, canvas, terminal, or any other format by swapping projectors.

## Architecture

```
BaseProjector (abstract)
    ├── DOMProjector      - Renders to browser DOM
    ├── TraceProjector    - Renders to text trace format
    └── Future projectors...
        ├── CanvasProjector   - Could render to HTML5 Canvas
        ├── TerminalProjector - Could render to terminal/CLI
        └── ServerProjector   - Could render to HTML strings
```

## Core Concepts

### BaseProjector

The abstract base class that all projectors must extend:

```javascript
class BaseProjector {
    init(config)           // Initialize with mount point and options
    render(universe)       // Render the universe to target format
    project(node, state)   // Project a symbolic node in context
    cleanup()             // Clean up resources
}
```

### ProjectorFactory

Factory for creating and managing projectors:

```javascript
ProjectorFactory.register('name', ProjectorClass)  // Register a projector
ProjectorFactory.create('name', config)            // Create an instance
ProjectorFactory.getAvailable()                    // List registered types
```

## Built-in Projectors

### DOMProjector

Renders symbolic UI to browser DOM elements:
- Creates real HTML elements
- Binds event handlers
- Handles dynamic content projection with `Show[...]`
- Supports two-way data binding

### TraceProjector

Renders symbolic UI to a text trace format:
- Useful for snapshot testing
- Debugging UI structure
- Generating documentation
- Server-side rendering preview

Example trace output:
```
=== TRACE OUTPUT ===
State: State[Count[0]]
UI Tree:
  <Div {class="card"}>
    <H1>
      [TEXT] "Counter"
    </H1>
    <P>
      [TEXT] "Value: "
      [SHOW] Count => 0
    </P>
    <Button {onClick=Inc, class="btn"}>
      [TEXT] "Increment"
    </Button>
  </Div>
=== END TRACE ===
```

## Usage

### Basic Usage

```javascript
import { boot } from './runtime.js';

// Use DOM projector (default)
await boot('/universe.json', '#app', 'dom');

// Use trace projector
await boot('/universe.json', console.log, 'trace');
```

### Creating a Custom Projector

```javascript
import { BaseProjector } from './projectors/base.js';

class MyCustomProjector extends BaseProjector {
    render(universe) {
        // Your rendering logic here
        const app = this.getProgramApp(universe);
        const [state, ui] = app.a;

        // Convert to your format
        const output = this.convertToMyFormat(ui, state);

        // Output to mount
        this.mount(output);
    }
}

// Register it
ProjectorFactory.register('custom', MyCustomProjector);

// Use it
await boot('/universe.json', myMount, 'custom');
```

### Switching Projectors at Runtime

```javascript
// Start with DOM
let handle = await boot('/universe.json', '#app', 'dom');

// Switch to trace
handle.projector.cleanup();
handle = await boot(handle.universe, console.log, 'trace');
```

### Snapshot Testing

```javascript
function testCounter() {
    const snapshot = createSnapshotProjector(universe);
    const output = snapshot.render(universe);

    assert(output.includes('State: State[Count[0]]'));
    assert(output.includes('[TEXT] "Increment"'));
}
```

## Benefits

1. **Separation of Concerns**: Core runtime logic separated from rendering
2. **Testability**: Use TraceProjector for snapshot tests without DOM
3. **Flexibility**: Easy to add new output formats
4. **Reusability**: Same symbolic UI works across different platforms
5. **Debugging**: Trace output helps understand UI structure

## Future Projectors

Potential projectors that could be implemented:

- **CanvasProjector**: Render to HTML5 Canvas for graphics/games
- **TerminalProjector**: Render to terminal for CLI applications
- **ServerProjector**: Generate HTML strings for SSR
- **NativeProjector**: Bridge to React Native or other native frameworks
- **3DProjector**: Render to WebGL/Three.js for 3D interfaces
- **PDFProjector**: Generate PDF documents
- **AccessibilityProjector**: Generate screen reader friendly output