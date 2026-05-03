/**
 * Commands Index
 * All slash commands for the bot
 * @module commands
 */

export { BaseCommand, CommandCategory } from './baseCommand.js';
export { type CommandData, type CommandOptions } from './baseCommand.js';

// Export all command modules
export * as general from './general/index.js';
export * as admin from './admin/index.js';
export * as owner from './owner/index.js';
export * as fun from './fun/index.js';
export * as music from './music/index.js';
export * as video from './video/index.js';
export * as api from './api/index.js';

// Keep named API command exports for compatibility.
export { default as anime } from './api/anime.js';
export { default as media } from './api/media.js';
export { default as nhentai } from './api/nhentai.js';
export { default as pixiv } from './api/pixiv.js';
export { default as reddit } from './api/reddit.js';
export { default as rule34 } from './api/rule34.js';
export { default as steam } from './api/steam.js';
export { default as wikipedia } from './api/wikipedia.js';


