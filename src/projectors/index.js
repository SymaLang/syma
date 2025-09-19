/**
 * Projectors Module
 *
 * Central export for all projector types and utilities.
 */

export { BaseProjector, ProjectorFactory } from './base.js';
export { DOMProjector } from './dom.js';
export { TraceProjector } from './trace.js';
export { TerminalProjector } from './terminal.js';

// Auto-register available projectors
import { ProjectorFactory } from './base.js';
import { DOMProjector } from './dom.js';
import { TraceProjector } from './trace.js';
import { TerminalProjector } from './terminal.js';

// Register built-in projectors
ProjectorFactory.register('dom', DOMProjector);
ProjectorFactory.register('trace', TraceProjector);
ProjectorFactory.register('terminal', TerminalProjector);

// Future projectors can be registered here:
// ProjectorFactory.register('canvas', CanvasProjector);
// ProjectorFactory.register('server', ServerProjector);