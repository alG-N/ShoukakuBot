/**
 * Events Module Index
 * Re-exports all event handlers
 * @module presentation/events
 */

export { BaseEvent } from './BaseEvent.js';
export { type EventOptions } from './BaseEvent.js';

// Import events
import ready from './ready.js';
import messageCreate from './messageCreate.js';
import messageUpdate from './messageUpdate.js';
import guildCreate from './guildCreate.js';
import guildDelete from './guildDelete.js';
import guildMemberAdd from './guildMemberAdd.js';
import guildMemberRemove from './guildMemberRemove.js';
import voiceStateUpdate from './voiceStateUpdate.js';

// Export individual events
export {
    ready,
    messageCreate,
    messageUpdate,
    guildCreate,
    guildDelete,
    guildMemberAdd,
    guildMemberRemove,
    voiceStateUpdate
};

// Export all events as array for easy registration
export const events = [
    ready,
    messageCreate,
    messageUpdate,
    guildCreate,
    guildDelete,
    guildMemberAdd,
    guildMemberRemove,
    voiceStateUpdate
];

export default events;


