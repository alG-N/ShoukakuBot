"use strict";
/**
 * Guild Delete Event - Presentation Layer
 * Fired when bot leaves a server
 * @module presentation/events/guildDelete
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const BaseEvent_js_1 = require("./BaseEvent.js");
const Logger_js_1 = __importDefault(require("../core/Logger.js"));
// GUILD DELETE EVENT
class GuildDeleteEvent extends BaseEvent_js_1.BaseEvent {
    constructor() {
        super({
            name: discord_js_1.Events.GuildDelete,
            once: false
        });
    }
    async execute(_client, guild) {
        Logger_js_1.default.info('GuildDelete', `Left server: ${guild.name} (${guild.id}) - Had ${guild.memberCount} members`);
        // Log detailed embed
        await Logger_js_1.default.logGuildEventDetailed('leave', guild);
    }
}
exports.default = new GuildDeleteEvent();
//# sourceMappingURL=guildDelete.js.map