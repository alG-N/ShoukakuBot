/**
 * Commands Index
 * All slash commands for the bot
 * @module commands
 */

export { BaseCommand, CommandCategory } from './BaseCommand.js';
export { type CommandData, type CommandOptions } from './BaseCommand.js';

// Export all command modules
export * as general from './general/index.js';
export * as admin from './admin/index.js';
export * as owner from './owner/index.js';
export * as api from './api/index.js';
export * as fun from './fun/index.js';
export * as music from './music/index.js';
export * as video from './video/index.js';


