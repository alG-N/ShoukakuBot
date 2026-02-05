"use strict";
/**
 * Guild Create Event - Presentation Layer
 * Fired when bot joins a new server
 * @module presentation/events/guildCreate
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const BaseEvent_js_1 = require("./BaseEvent.js");
const Logger_js_1 = __importDefault(require("../core/Logger.js"));
const SetupWizardService_js_1 = require("../services/guild/SetupWizardService.js");
// GUILD CREATE EVENT
class GuildCreateEvent extends BaseEvent_js_1.BaseEvent {
    constructor() {
        super({
            name: discord_js_1.Events.GuildCreate,
            once: false
        });
    }
    async execute(_client, guild) {
        Logger_js_1.default.info('GuildCreate', `Joined server: ${guild.name} (${guild.id}) - ${guild.memberCount} members`);
        // Log detailed embed with invite link
        await Logger_js_1.default.logGuildEventDetailed('join', guild);
        // Start setup wizard for new guild
        await SetupWizardService_js_1.setupWizardService.startWizard(guild);
    }
}
exports.default = new GuildCreateEvent();
//# sourceMappingURL=guildCreate.js.map