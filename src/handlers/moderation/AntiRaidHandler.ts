/**
 * Anti-Raid Handler
 * Orchestrates anti-raid responses for new member joins
 * Extracted from events/guildMemberAdd.ts to maintain proper layer boundaries
 * @module handlers/moderation/AntiRaidHandler
 */

import { Client, GuildMember, EmbedBuilder, Guild, TextChannel } from 'discord.js';
import antiRaidService, { type JoinAnalysis } from '../../services/moderation/AntiRaidService.js';
import moderationConfig from '../../config/features/moderation/index.js';
import { ModLogRepository } from '../../repositories/moderation/index.js';
import { logger } from '../../core/Logger.js';

interface ModLogSettings {
    log_channel_id: string | null;
}

/**
 * Handle anti-raid detection for a new member join
 */
export async function handleAntiRaid(client: Client, member: GuildMember): Promise<void> {
    try {
        const result = await antiRaidService.trackJoin(member);
        
        // If raid detected and not already in raid mode, activate
        if (result.isRaid && !(await antiRaidService.isRaidModeActive(member.guild.id))) {
            await antiRaidService.activateRaidMode(
                member.guild.id,
                'system',
                `Auto-detected: ${result.triggers.join(', ')}`
            );
            
            // Notify in mod log channel
            await notifyRaidDetected(client, member.guild, result);
        }
        
        // Handle suspicious new account during active raid
        if (result.isSuspicious && result.triggers.includes('raid_mode_active')) {
            const ageCheck = antiRaidService.checkAccountAge(member);
            
            if (ageCheck.isSuspicious) {
                await handleSuspiciousAccount(member, ageCheck);
            }
        }
        
    } catch (error: unknown) {
        logger.error('AntiRaid', `Error handling member join: ${(error as Error).message}`);
    }
}

/**
 * Notify mod log channel of raid detection
 */
async function notifyRaidDetected(client: Client, guild: Guild, result: JoinAnalysis): Promise<void> {
    try {
        const settings: ModLogSettings | null = await ModLogRepository.get(guild.id);
        
        if (!settings?.log_channel_id) return;
        
        const channel = guild.channels.cache.get(settings.log_channel_id) as TextChannel | undefined;
        if (!channel) return;
        
        const embed = new EmbedBuilder()
            .setColor(moderationConfig.COLORS?.RAID || 0xFF0000)
            .setTitle('\uD83D\uDEA8 RAID DETECTED - AUTO-ACTIVATED')
            .setDescription([
                '**Raid mode has been automatically activated.**',
                '',
                `\u2022 Triggers: ${result.triggers.join(', ')}`,
                `\u2022 Recent joins: ${result.stats.joinCount}`,
                `\u2022 New accounts: ${result.stats.newAccounts}`,
                '',
                'Use `/raid status` for details.',
                'Use `/raid clean kick/ban` to remove flagged users.',
                'Use `/raid off` to deactivate.'
            ].join('\n'))
            .setTimestamp();
        
        await channel.send({ embeds: [embed] });
        
    } catch (error: unknown) {
        logger.error('AntiRaid', `Raid notification error: ${(error as Error).message}`);
    }
}

/**
 * Handle suspicious account during active raid
 */
async function handleSuspiciousAccount(
    member: GuildMember,
    ageCheck: { isSuspicious: boolean; action: string; accountAgeDays: number }
): Promise<void> {
    const action = ageCheck.action || 'flag';
    
    switch (action) {
        case 'kick':
            try {
                await member.kick(`Anti-raid: Account too new (${ageCheck.accountAgeDays} days old)`);
                await antiRaidService.updateStats(member.guild.id, 'kick');
            } catch {
                // Failed to kick, just flag
                await antiRaidService.updateStats(member.guild.id, 'flag');
            }
            break;
            
        case 'ban':
            try {
                await member.ban({ 
                    reason: `Anti-raid: Account too new (${ageCheck.accountAgeDays} days old)`,
                    deleteMessageSeconds: 0
                });
                await antiRaidService.updateStats(member.guild.id, 'ban');
            } catch {
                await antiRaidService.updateStats(member.guild.id, 'flag');
            }
            break;
            
        case 'flag':
        default:
            await antiRaidService.updateStats(member.guild.id, 'flag');
            break;
    }
}
