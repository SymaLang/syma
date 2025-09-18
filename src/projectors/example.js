/**
 * Example: Using Different Projectors
 *
 * This example demonstrates how to use different projectors
 * for various output formats from the same symbolic UI.
 */

import { boot } from '../runtime.js';

// Example: Use DOM projector for browser rendering (default)
async function renderToDOM() {
    const handle = await boot('/universe.json', '#app', 'dom');
    console.log('DOM projector initialized:', handle.projector.getType());
}

// Example: Use trace projector for testing/debugging
async function renderToTrace() {
    // Create a mock mount that collects output
    const traceOutput = [];
    const mockMount = (output) => {
        traceOutput.push(output);
        console.log(output);
    };

    // Mock DOM element for compatibility
    const mockElement = { innerHTML: '' };
    document.querySelector = () => mockElement;

    const handle = await boot('/universe.json', mockMount, 'trace');
    console.log('Trace projector initialized:', handle.projector.getType());

    // Simulate an action
    const action = { k: 'Sym', v: 'Inc' };
    handle.projector.onDispatch(action);

    // Get the trace output
    return traceOutput;
}

// Example: Switch projectors at runtime
async function switchProjectors() {
    // Start with DOM
    let handle = await boot('/universe.json', '#app', 'dom');
    console.log('Initial projector:', handle.projector.getType());

    // Get current state
    const universe = handle.universe;

    // Clean up DOM projector
    handle.projector.cleanup();

    // Switch to trace projector
    const traceMount = (output) => console.log('TRACE:', output);
    handle = await boot(universe, traceMount, 'trace');
    console.log('Switched to:', handle.projector.getType());
}

// Example: Custom projector for snapshot testing
export function createSnapshotProjector(universe) {
    const { ProjectorFactory } = window.SymbolicHost;

    const snapshotMount = [];
    const projector = ProjectorFactory.create('trace', {
        mount: (output) => snapshotMount.push(output),
        onDispatch: () => {},
        options: {
            universe,
            normalize: window.SymbolicHost.normalize,
            extractRules: window.SymbolicHost.extractRules
        }
    });

    return {
        projector,
        getSnapshot: () => snapshotMount.join('\n'),
        render: (uni) => {
            projector.render(uni);
            return snapshotMount[snapshotMount.length - 1];
        }
    };
}

// Example usage in tests:
/*
describe('Counter App', () => {
    it('should render initial state', async () => {
        const snapshot = createSnapshotProjector(universe);
        const output = snapshot.render(universe);

        expect(output).toContain('State: State[Count[0]]');
        expect(output).toContain('<Button {onClick=Inc}>');
        expect(output).toContain('[TEXT] "Increment"');
    });

    it('should increment counter', async () => {
        const snapshot = createSnapshotProjector(universe);

        // Simulate increment action
        const newUniverse = dispatch(universe, rules, Inc);
        const output = snapshot.render(newUniverse);

        expect(output).toContain('State: State[Count[1]]');
    });
});
*/

console.log('Available projectors:', window.SymbolicHost?.getProjectorTypes?.() || ['dom', 'trace']);