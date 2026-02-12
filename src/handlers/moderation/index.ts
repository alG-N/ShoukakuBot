/**
 * Moderation Handlers Index
 * @module handlers/moderation
 */

// TypeScript handlers
export { default as ModLogHandler } from './ModLogHandler.js';
export { 
    handleMessageDelete, 
    handleMessageUpdate as handleMessageUpdateLog,
    handleMemberJoin,
    handleMemberLeave,
    buildQuickEmbed,
    sendConfirmation,
    TYPE_COLORS,
    TYPE_EMOJIS
} from './ModLogHandler.js';
export type {
    ModActionType,
    QuickEmbedOptions
} from './ModLogHandler.js';

export { default as AutoModHandler } from './AutoModHandler.js';
export {
    handleMessage as handleAutoModMessage,
    handleMessageUpdate as handleAutoModUpdate,
    buildSettingsEmbed,
    formatAction
} from './AutoModHandler.js';
export type {
    ViolationType,
    ActionType,
    Violation,
    ActionResult,
    AutoModSettings
} from './AutoModHandler.js';

// Anti-raid handler
export { handleAntiRaid } from './AntiRaidHandler.js';
