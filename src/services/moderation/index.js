/**
 * Moderation Services
 * @module services/moderation
 */
const ModerationService = require('./ModerationService');
const SnipeService = require('./SnipeService');
const InfractionService = require('./InfractionService');
const ModLogService = require('./ModLogService');
const FilterService = require('./FilterService');
const AutoModService = require('./AutoModService');
const AntiRaidService = require('./AntiRaidService');
const LockdownService = require('./LockdownService');

module.exports = {
    ModerationService,
    SnipeService,
    InfractionService,
    ModLogService,
    FilterService,
    AutoModService,
    AntiRaidService,
    LockdownService
};
