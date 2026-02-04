/**
 * Registry Services Index
 * Command and Event registration
 * @module services/registry
 */

export { CommandRegistry, default as commandRegistry } from './CommandRegistry.js';
export type { Command } from './CommandRegistry.js';

export { EventRegistry, default as eventRegistry } from './EventRegistry.js';
export type { Event } from './EventRegistry.js';
