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
export * as fun from './fun/index.js';
export * as music from './music/index.js';
export * as video from './video/index.js';

// API commands are now root-level command modules
export { default as anime } from './anime.js';
export { default as media } from './media.js';
export { default as nhentai } from './nhentai.js';
export { default as pixiv } from './pixiv.js';
export { default as reddit } from './reddit.js';
export { default as rule34 } from './rule34.js';
export { default as steam } from './steam.js';
export { default as wikipedia } from './wikipedia.js';


