/**
 * Guild Member Add Event - Presentation Layer
 * Handles new member joins for anti-raid and mod logging
 * @module presentation/events/guildMemberAdd
 */

const { Events, EmbedBuilder } = require('discord.js');
const { BaseEvent } = require('./BaseEvent');
const AntiRaidService = require('../services/moderation/AntiRaidService');
const { ModLogHandler } = require('../handlers/moderation');
const moderationConfig = require('../config/features/moderation');

class GuildMemberAddEvent extends BaseEvent {
    constructor() {
        super({
            name: Events.GuildMemberAdd,
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
     * @param {Client} client 
     * @param {GuildMember} member 
     */
    async _handleAntiRaid(client, member) {
        try {
            const result = AntiRaidService.trackJoin(member);
            
            // If raid detected and not already in raid mode, activate
            if (result.isRaid && !AntiRaidService.isRaidModeActive(member.guild.id)) {
                AntiRaidService.activateRaidMode(
                    member.guild.id,
                    'system',
                    `Auto-detected: ${result.triggers.join(', ')}`
                );
                
                // Notify in mod log channel
                await this._notifyRaidDetected(client, member.guild, result);
            }
            
            // Handle suspicious new account during raid
            if (result.isSuspicious && result.triggers.includes('raid_mode_active')) {
                // Check account age
                const ageCheck = AntiRaidService.checkAccountAge(member);
                
                if (ageCheck.isSuspicious) {
                    // Take action based on config
                    await this._handleSuspiciousAccount(client, member, ageCheck);
                }
            }
            
        } catch (error) {
            client.logger?.error('Anti-raid error:', error);
        }
    }
    
    /**
     * Notify mod log channel of raid detection
     * @param {Client} client 
     * @param {Guild} guild 
     * @param {Object} result 
     */
    async _notifyRaidDetected(client, guild, result) {
        try {
            const { ModLogRepository } = require('../repositories/moderation');
            const settings = await ModLogRepository.getSettings(guild.id);
            
            if (!settings?.enabled || !settings?.logChannel) return;
            
            const channel = guild.channels.cache.get(settings.logChannel);
            if (!channel) return;
            
            const embed = new EmbedBuilder()
                .setColor(moderationConfig.COLORS.RAID)
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
            
        } catch (error) {
            client.logger?.error('Raid notification error:', error);
        }
    }
    
    /**
     * Handle suspicious account during raid
     * @param {Client} client 
     * @param {GuildMember} member 
     * @param {Object} ageCheck 
     */
    async _handleSuspiciousAccount(client, member, ageCheck) {
        const action = ageCheck.action || 'flag';
        
        switch (action) {
            case 'kick':
                try {
                    await member.kick(`Anti-raid: Account too new (${ageCheck.accountAgeDays} days old)`);
                    AntiRaidService.updateStats(member.guild.id, 'kick');
                } catch {
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
                } catch {
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
     * @param {Client} client 
     * @param {GuildMember} member 
     */
    async _handleModLog(client, member) {
        try {
            await ModLogHandler.handleMemberJoin(client, member);
        } catch (error) {
            client.logger?.error('Mod log (join) error:', error);
        }
    }
}

module.exports = new GuildMemberAddEvent();
