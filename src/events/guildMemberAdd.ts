/**
 * Guild Member Add Event - Presentation Layer
 * Handles new member joins for anti-raid and mod logging
 * @module presentation/events/guildMemberAdd
 */

import { Events, Client, GuildMember, EmbedBuilder, Guild, TextChannel } from 'discord.js';
import { BaseEvent } from './BaseEvent.js';
import { handleMemberJoin } from '../handlers/moderation/index.js';

const getDefault = <T>(mod: { default?: T } | T): T => (mod as { default?: T }).default || mod as T;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const AntiRaidService = getDefault(require('../services/moderation/AntiRaidService'));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const moderationConfig = getDefault(require('../config/features/moderation'));
// TYPES
interface RaidResult {
    isRaid: boolean;
    isSuspicious: boolean;
    triggers: string[];
    stats: {
        joinCount: number;
        newAccounts: number;
    };
}

interface AgeCheckResult {
    isSuspicious: boolean;
    action?: string;
    accountAgeDays: number;
}

interface ModLogSettings {
    log_channel_id: string | null;
}
// GUILD MEMBER ADD EVENT
class GuildMemberAddEvent extends BaseEvent {
    constructor() {
        super({
            name: Events.GuildMemberAdd,
            once: false
        });
    }

    async execute(client: Client, member: GuildMember): Promise<void> {
        // Handle anti-raid tracking
        await this._handleAntiRaid(client, member);
        
        // Log member join
        await this._handleModLog(client, member);
    }
    
    /**
     * Handle anti-raid detection
     */
    private async _handleAntiRaid(client: Client, member: GuildMember): Promise<void> {
        try {
            const result: RaidResult = await AntiRaidService.trackJoin(member);
            
            // If raid detected and not already in raid mode, activate
            if (result.isRaid && !(await AntiRaidService.isRaidModeActive(member.guild.id))) {
                await AntiRaidService.activateRaidMode(
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
                const ageCheck: AgeCheckResult = AntiRaidService.checkAccountAge(member);
                
                if (ageCheck.isSuspicious) {
                    // Take action based on config
                    await this._handleSuspiciousAccount(member, ageCheck);
                }
            }
            
        } catch (error: unknown) {
            const clientWithLogger = client as Client & { logger?: { error: (msg: string, err: unknown) => void } };
            clientWithLogger.logger?.error('Anti-raid error:', error);
        }
    }
    
    /**
     * Notify mod log channel of raid detection
     */
    private async _notifyRaidDetected(client: Client, guild: Guild, result: RaidResult): Promise<void> {
        try {
            const { ModLogRepository } = await import('../repositories/moderation/index.js');
            const settings: ModLogSettings | null = await ModLogRepository.get(guild.id);
            
            if (!settings?.log_channel_id) return;
            
            const channel = guild.channels.cache.get(settings.log_channel_id) as TextChannel | undefined;
            if (!channel) return;
            
            const embed = new EmbedBuilder()
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
            
        } catch (error: unknown) {
            const clientWithLogger = client as Client & { logger?: { error: (msg: string, err: unknown) => void } };
            clientWithLogger.logger?.error('Raid notification error:', error);
        }
    }
    
    /**
     * Handle suspicious account during raid
     */
    private async _handleSuspiciousAccount(member: GuildMember, ageCheck: AgeCheckResult): Promise<void> {
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
     */
    private async _handleModLog(client: Client, member: GuildMember): Promise<void> {
        try {
            await handleMemberJoin(member);
        } catch (error: unknown) {
            const clientWithLogger = client as Client & { logger?: { error: (msg: string, err: unknown) => void } };
            clientWithLogger.logger?.error('Mod log (join) error:', error);
        }
    }
}

export default new GuildMemberAddEvent();
