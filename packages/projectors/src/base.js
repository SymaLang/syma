/**
 * Base Projector Interface
 *
 * Defines the contract for all projectors in the Syma runtime.
 * A projector is responsible for rendering the symbolic UI representation
 * into a specific output format (DOM, string, canvas, etc.).
 */

/**
 * @typedef {Object} ProjectorConfig
 * @property {*} mount - The mount point/target for rendering
 * @property {Function} onDispatch - Callback for dispatching actions
 * @property {Object} [options] - Additional projector-specific options
 */

/**
 * Abstract base class for projectors
 */
export class BaseProjector {
    constructor() {
        if (new.target === BaseProjector) {
            throw new Error("BaseProjector is abstract and cannot be instantiated directly");
        }
        this.mount = null;
        this.onDispatch = null;
        this.options = {};
        this.initialized = false;
    }

    /**
     * Initialize the projector with configuration
     * @param {ProjectorConfig} config - Projector configuration
     */
    init(config) {
        this.mount = config.mount;
        this.onDispatch = config.onDispatch;
        this.options = config.options || {};
        this.initialized = true;
        return this;
    }

    /**
     * Render the universe to the target
     * @param {Object} universe - The universe AST to render
     * @abstract
     */
    render(universe) {
        throw new Error("render() must be implemented by subclass");
    }

    /**
     * Project a symbolic node in a given state context
     * @param {Object} node - The node to project
     * @param {Object} state - The current state context
     * @returns {*} The projected result
     * @abstract
     */
    project(node, state) {
        throw new Error("project() must be implemented by subclass");
    }

    /**
     * Clean up resources
     */
    cleanup() {
        this.mount = null;
        this.onDispatch = null;
        this.options = {};
        this.initialized = false;
    }

    /**
     * Check if projector is initialized
     * @returns {boolean}
     */
    isInitialized() {
        return this.initialized;
    }

    /**
     * Get projector type/name
     * @returns {string}
     */
    getType() {
        return this.constructor.name;
    }
}

/**
 * Factory for creating projectors
 */
export class ProjectorFactory {
    static projectors = new Map();

    /**
     * Register a projector class
     * @param {string} name - Name of the projector
     * @param {typeof BaseProjector} ProjectorClass - The projector class
     */
    static register(name, ProjectorClass) {
        if (!(ProjectorClass.prototype instanceof BaseProjector)) {
            throw new Error(`${name} must extend BaseProjector`);
        }
        this.projectors.set(name, ProjectorClass);
    }

    /**
     * Create a projector instance
     * @param {string} name - Name of the projector
     * @param {ProjectorConfig} config - Projector configuration
     * @returns {BaseProjector} Initialized projector instance
     */
    static create(name, config) {
        const ProjectorClass = this.projectors.get(name);
        if (!ProjectorClass) {
            throw new Error(`Unknown projector: ${name}`);
        }
        const projector = new ProjectorClass();
        return projector.init(config);
    }

    /**
     * Get list of registered projectors
     * @returns {string[]}
     */
    static getAvailable() {
        return Array.from(this.projectors.keys());
    }
}