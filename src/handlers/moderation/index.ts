/**
 * Moderation Handlers Index
 * @module handlers/moderation
 */

// TypeScript handlers
export { default as ModLogHandler } from './modLogHandler.js';
export { 
    handleMessageDelete, 
    handleMessageUpdate as handleMessageUpdateLog,
    handleMemberJoin,
    handleMemberLeave,
    buildQuickEmbed,
    sendConfirmation,
    TYPE_COLORS,
    TYPE_EMOJIS
} from './modLogHandler.js';
export { type ModActionType, type QuickEmbedOptions } from '../../types/moderation/handlers.js';

export { default as AutoModHandler } from './automod/autoModHandler.js';
export {
    handleMessage as handleAutoModMessage,
    handleMessageUpdate as handleAutoModUpdate,
    buildSettingsEmbed,
    formatAction
} from './automod/autoModHandler.js';
export { type ViolationType, type ActionResult } from '../../types/moderation/handlers.js';
export { type ActionType } from '../../config/features/moderation/index.js';
export { type Violation } from '../../services/moderation/autoModService.js';
export { type AutoModSettings } from '../../types/moderation/automod.js';

// Anti-raid handler
export { handleAntiRaid } from './antiRaidHandler.js';

// AutoMod command panels, handlers, and types
export {
    showMainPanel,
    showToggleSection,
    showFilterSection,
    showConfigSection,
    showActionsSection,
    showExemptSection,
    showEscalationConfig
} from './automod/autoModPanels.js';

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
} from './automod/autoModSettingsHandlers.js';

export { type AutoModService as AutoModCommandService } from '../../types/moderation/handlers.js';
export { type ModerationConfig as AutoModModerationConfig } from '../../config/features/moderation/index.js';
export { type AutoModSettings as AutoModCommandSettings } from '../../types/moderation/automod.js';


