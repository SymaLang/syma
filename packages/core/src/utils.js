import { Str } from './ast-helpers.js';

/**
 * Generate a unique ID for effects and other purposes
 */
let idCounter = 0;

export function freshId() {
    return Str(`id_${Date.now()}_${idCounter++}`);
}
