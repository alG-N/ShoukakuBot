"use strict";
/**
 * Guild Member Add Event - Presentation Layer
 * Handles new member joins for anti-raid and mod logging
 * @module presentation/events/guildMemberAdd
 */
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const BaseEvent_js_1 = require("./BaseEvent.js");
const index_js_1 = require("../handlers/moderation/index.js");
const getDefault = (mod) => mod.default || mod;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const AntiRaidService = getDefault(require('../services/moderation/AntiRaidService'));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const moderationConfig = getDefault(require('../config/features/moderation'));
// GUILD MEMBER ADD EVENT
class GuildMemberAddEvent extends BaseEvent_js_1.BaseEvent {
    constructor() {
        super({
            name: discord_js_1.Events.GuildMemberAdd,
            once: false
        });
    }
    async execute(client, member) {
        // Handle anti-raid tracking
        await this._handleAntiRaid(client, member);
        // Log member join
        await this._handleModLog(client, member);
    }
    /**
     * Handle anti-raid detection
     */
    async _handleAntiRaid(client, member) {
        try {
            const result = await AntiRaidService.trackJoin(member);
            // If raid detected and not already in raid mode, activate
            if (result.isRaid && !(await AntiRaidService.isRaidModeActive(member.guild.id))) {
                await AntiRaidService.activateRaidMode(member.guild.id, 'system', `Auto-detected: ${result.triggers.join(', ')}`);
                // Notify in mod log channel
                await this._notifyRaidDetected(client, member.guild, result);
            }
            // Handle suspicious new account during raid
            if (result.isSuspicious && result.triggers.includes('raid_mode_active')) {
                // Check account age
                const ageCheck = AntiRaidService.checkAccountAge(member);
                if (ageCheck.isSuspicious) {
                    // Take action based on config
                    await this._handleSuspiciousAccount(member, ageCheck);
                }
            }
        }
        catch (error) {
            const clientWithLogger = client;
            clientWithLogger.logger?.error('Anti-raid error:', error);
        }
    }
    /**
     * Notify mod log channel of raid detection
     */
    async _notifyRaidDetected(client, guild, result) {
        try {
            const { ModLogRepository } = await import('../repositories/moderation/index.js');
            const settings = await ModLogRepository.get(guild.id);
            if (!settings?.log_channel_id)
                return;
            const channel = guild.channels.cache.get(settings.log_channel_id);
            if (!channel)
                return;
            const embed = new discord_js_1.EmbedBuilder()
                .setColor(moderationConfig.COLORS?.RAID || 0xFF0000)
                .setTitle('🚨 RAID DETECTED - AUTO-ACTIVATED')
                .setDescription([
                '**Raid mode has been automatically activated.**',
                '',
                `• Triggers: ${result.triggers.join(', ')}`,
                `• Recent joins: ${result.stats.joinCount}`,
                `• New accounts: ${result.stats.newAccounts}`,
                '',
                'Use `/raid status` for details.',
                'Use `/raid clean kick/ban` to remove flagged users.',
                'Use `/raid off` to deactivate.'
            ].join('\n'))
                .setTimestamp();
            await channel.send({ embeds: [embed] });
        }
        catch (error) {
            const clientWithLogger = client;
            clientWithLogger.logger?.error('Raid notification error:', error);
        }
    }
    /**
     * Handle suspicious account during raid
     */
    async _handleSuspiciousAccount(member, ageCheck) {
        const action = ageCheck.action || 'flag';
        switch (action) {
            case 'kick':
                try {
                    await member.kick(`Anti-raid: Account too new (${ageCheck.accountAgeDays} days old)`);
                    AntiRaidService.updateStats(member.guild.id, 'kick');
                }
                catch {
                    // Failed to kick, just flag
                    AntiRaidService.updateStats(member.guild.id, 'flag');
                }
                break;
            case 'ban':
                try {
                    await member.ban({
                        reason: `Anti-raid: Account too new (${ageCheck.accountAgeDays} days old)`,
                        deleteMessageSeconds: 0
                    });
                    AntiRaidService.updateStats(member.guild.id, 'ban');
                }
                catch {
                    AntiRaidService.updateStats(member.guild.id, 'flag');
                }
                break;
            case 'flag':
            default:
                AntiRaidService.updateStats(member.guild.id, 'flag');
                break;
        }
    }
    /**
     * Handle mod log for member join
     */
    async _handleModLog(client, member) {
        try {
            await (0, index_js_1.handleMemberJoin)(member);
        }
        catch (error) {
            const clientWithLogger = client;
            clientWithLogger.logger?.error('Mod log (join) error:', error);
        }
    }
}
exports.default = new GuildMemberAddEvent();
//# sourceMappingURL=guildMemberAdd.js.map