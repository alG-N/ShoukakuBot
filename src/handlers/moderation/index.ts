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
export { type ModActionType, type QuickEmbedOptions } from '../../types/moderation/handlers.js';

export { default as AutoModHandler } from './AutoModHandler.js';
export {
    handleMessage as handleAutoModMessage,
    handleMessageUpdate as handleAutoModUpdate,
    buildSettingsEmbed,
    formatAction
} from './AutoModHandler.js';
export { type ViolationType, type ActionResult } from '../../types/moderation/handlers.js';
export { type ActionType } from '../../config/features/moderation/index.js';
export { type Violation } from '../../services/moderation/AutoModService.js';
export { type AutoModSettings } from '../../types/moderation/automod.js';

// Anti-raid handler
export { handleAntiRaid } from './AntiRaidHandler.js';

// AutoMod command panels, handlers, and types
export {
    showMainPanel,
    showToggleSection,
    showFilterSection,
    showConfigSection,
    showActionsSection,
    showExemptSection,
    showEscalationConfig
} from './AutoModPanels.js';

export {
    handleFilterAction,
    handleFilterActionDeferred,
    handleConfigSelect,
    handleIgnoreChannel,
    handleIgnoreRole,
    handleActionSelect,
    handleActionValue,
    handleWhitelistLinks,
    handleEscalationSelect,
    handleEscalationActionSelect,
    handleEscalationActionValue
} from './AutoModSettingsHandlers.js';

export { type AutoModService as AutoModCommandService, type ModerationConfig as AutoModModerationConfig, type AutoModSettings as AutoModCommandSettings } from './AutoModTypes.js';


