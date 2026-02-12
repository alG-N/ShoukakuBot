/**
 * Module Helper Utilities
 * Provides helper functions for working with CJS/ESM module interop
 * @module utils/common/moduleHelper
 */

/**
 * Extract the default export from a module, handling CJS/ESM interop.
 * When using `require()` on an ESM module, the result may be wrapped in
 * `{ default: actualExport }`. This helper unwraps it transparently.
 * 
 * @example
 * const service = getDefault(require('../../services/SomeService.js'));
 * 
 * @param mod - The module object (may be `{ default: T }` or `T` directly)
 * @returns The unwrapped default export
 */
export const getDefault = <T>(mod: { default?: T } | T): T => (mod as { default?: T }).default || mod as T;
