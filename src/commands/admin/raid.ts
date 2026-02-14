/**
 * Raid Command
 * Manage anti-raid mode
 * @module commands/admin/raid
 */

import { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    PermissionFlagsBits,
    ChatInputCommandInteraction
} from 'discord.js';
import { BaseCommand, CommandCategory, type CommandData } from '../BaseCommand.js';
import _antiRaidModule from '../../services/moderation/AntiRaidService.js';
import _lockdownModule from '../../services/moderation/LockdownService.js';
import _moderationConfigModule from '../../config/features/moderation/index.js';
interface ModerationConfig {
    COLORS: Record<string, number>;
    EMOJIS: Record<string, string>;
}

interface RaidState {
    active: boolean;
    activatedAt?: number;
    activatedBy?: string;
    reason?: string;
    stats?: {
        kickedCount?: number;
        bannedCount?: number;
    };
}

interface LockStatus {
    lockedCount: number;
}

interface LockResults {
    success: string[];
    skipped: string[];
    failed: string[];
}

interface DeactivateResult {
    duration: number;
    flaggedAccounts: number;
    stats?: {
        kickedCount?: number;
        bannedCount?: number;
    };
}

interface AntiRaidService {
    isRaidModeActive?: (guildId: string) => Promise<boolean>;
    activateRaidMode?: (guildId: string, userId: string, reason: string) => Promise<void>;
    deactivateRaidMode?: (guildId: string) => Promise<DeactivateResult>;
    getRaidModeState?: (guildId: string) => Promise<RaidState | null>;
    getFlaggedAccounts?: (guildId: string) => Promise<string[]>;
    updateStats?: (guildId: string, action: 'kick' | 'ban') => Promise<void>;
}

interface LockdownService {
    lockServer?: (guild: ChatInputCommandInteraction['guild'], reason: string) => Promise<LockResults>;
    unlockServer?: (guild: ChatInputCommandInteraction['guild'], reason: string) => Promise<LockResults>;
    getLockStatus?: (guildId: string) => Promise<LockStatus>;
}


// SERVICE IMPORTS — static ESM imports (converted from CJS require())
const antiRaidService: AntiRaidService = _antiRaidModule as any;
const lockdownService: LockdownService = _lockdownModule as any;
const moderationConfig: ModerationConfig = _moderationConfigModule as any;

class RaidCommand extends BaseCommand {
    constructor() {
        super({
            category: CommandCategory.ADMIN,
            cooldown: 5,
            deferReply: false,
            userPermissions: [PermissionFlagsBits.Administrator]
        });
    }

    get data(): CommandData {
        return new SlashCommandBuilder()
            .setName('raid')
            .setDescription('🛡️ Anti-raid mode controls')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
            .addSubcommand(sub =>
                sub.setName('on')
                    .setDescription('Activate raid mode')
                    .addStringOption(opt =>
                        opt.setName('reason')
                            .setDescription('Reason for activating raid mode')
                            .setMaxLength(500)
                    )
                    .addBooleanOption(opt =>
                        opt.setName('lockdown')
                            .setDescription('Also lock the server?')
                    )
            )
            .addSubcommand(sub =>
                sub.setName('off')
                    .setDescription('Deactivate raid mode')
                    .addBooleanOption(opt =>
                        opt.setName('unlock')
                            .setDescription('Also unlock the server?')
                    )
            )
            .addSubcommand(sub =>
                sub.setName('status')
                    .setDescription('View raid mode status')
            )
            .addSubcommand(sub =>
                sub.setName('clean')
                    .setDescription('Kick/ban users who joined during raid')
                    .addStringOption(opt =>
                        opt.setName('action')
                            .setDescription('Action to take')
                            .setRequired(true)
                            .addChoices(
                                { name: 'Kick', value: 'kick' },
                                { name: 'Ban', value: 'ban' }
                            )
                    )
            );
    }

    async run(interaction: ChatInputCommandInteraction): Promise<void> {
        const subcommand = interaction.options.getSubcommand();
        
        switch (subcommand) {
            case 'on':
                await this._activateRaidMode(interaction);
                break;
            case 'off':
                await this._deactivateRaidMode(interaction);
                break;
            case 'status':
                await this._showStatus(interaction);
                break;
            case 'clean':
                await this._cleanRaiders(interaction);
                break;
        }
    }
    
    /**
     * Activate raid mode
     */
    private async _activateRaidMode(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!interaction.guild) {
            await this.errorReply(interaction, 'This command can only be used in a server.');
            return;
        }

        const reason = interaction.options.getString('reason') || 'Manual activation';
        const lockdown = interaction.options.getBoolean('lockdown') ?? false;
        
        // Check if already active
        if (await antiRaidService?.isRaidModeActive?.(interaction.guild.id)) {
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(moderationConfig?.COLORS?.WARNING || 0xFFAA00)
                        .setDescription(`${moderationConfig?.EMOJIS?.WARNING || '⚠️'} Raid mode is already active!`)
                ],
                ephemeral: true
            });
            return;
        }
        
        await interaction.deferReply();
        
        // Activate raid mode
        await antiRaidService?.activateRaidMode?.(
            interaction.guild.id,
            interaction.user.id,
            reason
        );
        
        const embed = new EmbedBuilder()
            .setColor(moderationConfig?.COLORS?.RAID || 0xFF0000)
            .setTitle('🛡️ RAID MODE ACTIVATED')
            .setDescription([
                '**New member joins will be monitored and flagged.**',
                '',
                '• New accounts will be automatically flagged',
                '• Use `/raid clean` to remove flagged users',
                '• Use `/raid off` to deactivate'
            ].join('\n'))
            .addFields(
                { name: 'Activated By', value: `${interaction.user}`, inline: true },
                { name: 'Reason', value: reason, inline: true }
            )
            .setTimestamp();
        
        // Optionally lock server
        if (lockdown) {
            const lockResults = await lockdownService?.lockServer?.(
                interaction.guild,
                `Raid lockdown | ${reason}`
            ) || { success: [] };
            
            embed.addFields({
                name: '🔒 Server Lockdown',
                value: `${lockResults.success.length} channels locked`,
                inline: true
            });
        }
        
        await interaction.editReply({ embeds: [embed] });
    }
    
    /**
     * Deactivate raid mode
     */
    private async _deactivateRaidMode(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!interaction.guild) {
            await this.errorReply(interaction, 'This command can only be used in a server.');
            return;
        }

        const unlock = interaction.options.getBoolean('unlock') ?? false;
        
        // Check if active
        if (!(await antiRaidService?.isRaidModeActive?.(interaction.guild.id))) {
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(moderationConfig?.COLORS?.INFO || 0x5865F2)
                        .setDescription(`${moderationConfig?.EMOJIS?.INFO || 'ℹ️'} Raid mode is not active.`)
                ],
                ephemeral: true
            });
            return;
        }
        
        await interaction.deferReply();
        
        const result = await antiRaidService?.deactivateRaidMode?.(interaction.guild.id) || { 
            duration: 0, 
            flaggedAccounts: 0 
        };
        
        const durationMinutes = Math.floor(result.duration / 60000);
        
        const embed = new EmbedBuilder()
            .setColor(moderationConfig?.COLORS?.SUCCESS || 0x00FF00)
            .setTitle('✅ Raid Mode Deactivated')
            .addFields(
                { name: 'Duration', value: `${durationMinutes} minutes`, inline: true },
                { name: 'Flagged Users', value: `${result.flaggedAccounts}`, inline: true }
            );
        
        if (result.stats) {
            embed.addFields(
                { name: 'Kicked', value: `${result.stats.kickedCount || 0}`, inline: true },
                { name: 'Banned', value: `${result.stats.bannedCount || 0}`, inline: true }
            );
        }
        
        // Optionally unlock server
        if (unlock) {
            const unlockResults = await lockdownService?.unlockServer?.(
                interaction.guild,
                'Raid ended'
            ) || { success: [] };
            
            embed.addFields({
                name: '🔓 Server Unlocked',
                value: `${unlockResults.success.length} channels unlocked`,
                inline: false
            });
        }
        
        await interaction.editReply({ embeds: [embed] });
    }
    
    /**
     * Show raid mode status
     */
    private async _showStatus(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!interaction.guild) {
            await this.errorReply(interaction, 'This command can only be used in a server.');
            return;
        }

        const state = await antiRaidService?.getRaidModeState?.(interaction.guild.id);
        const flagged = await antiRaidService?.getFlaggedAccounts?.(interaction.guild.id) || [];
        const lockStatus = await lockdownService?.getLockStatus?.(interaction.guild.id) || { lockedCount: 0 };
        
        if (!state?.active) {
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(moderationConfig?.COLORS?.SUCCESS || 0x00FF00)
                        .setTitle('Raid Mode Status')
                        .setDescription('✅ **Inactive** - No raid detected')
                        .addFields({
                            name: 'Locked Channels',
                            value: `${lockStatus.lockedCount}`,
                            inline: true
                        })
                ],
                ephemeral: true
            });
            return;
        }
        
        const durationMinutes = Math.floor((Date.now() - (state.activatedAt || 0)) / 60000);
        const activatedBy = state.activatedBy === 'system' 
            ? 'System (Auto-detected)' 
            : `<@${state.activatedBy}>`;
        
        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(moderationConfig?.COLORS?.RAID || 0xFF0000)
                    .setTitle('🛡️ Raid Mode ACTIVE')
                    .addFields(
                        { name: 'Activated By', value: activatedBy, inline: true },
                        { name: 'Duration', value: `${durationMinutes} minutes`, inline: true },
                        { name: 'Reason', value: state.reason || 'No reason', inline: false },
                        { name: 'Flagged Users', value: `${flagged.length}`, inline: true },
                        { name: 'Kicked', value: `${state.stats?.kickedCount || 0}`, inline: true },
                        { name: 'Banned', value: `${state.stats?.bannedCount || 0}`, inline: true },
                        { name: 'Locked Channels', value: `${lockStatus.lockedCount}`, inline: true }
                    )
            ],
            ephemeral: true
        });
    }
    
    /**
     * Clean users who joined during raid
     */
    private async _cleanRaiders(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!interaction.guild) {
            await this.errorReply(interaction, 'This command can only be used in a server.');
            return;
        }

        const action = interaction.options.getString('action', true);
        
        const flagged = await antiRaidService?.getFlaggedAccounts?.(interaction.guild.id) || [];
        
        if (flagged.length === 0) {
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(moderationConfig?.COLORS?.INFO || 0x5865F2)
                        .setDescription(`${moderationConfig?.EMOJIS?.INFO || 'ℹ️'} No flagged users to clean.`)
                ],
                ephemeral: true
            });
            return;
        }
        
        await interaction.deferReply();
        
        const results = {
            success: 0,
            failed: 0,
            notFound: 0
        };
        
        for (const userId of flagged) {
            try {
                const member = await interaction.guild.members.fetch(userId).catch(() => null);
                
                if (!member) {
                    results.notFound++;
                    continue;
                }
                
                // Skip if has roles (probably not a raider)
                if (member.roles.cache.size > 1) {
                    results.notFound++;
                    continue;
                }
                
                if (action === 'kick') {
                    await member.kick(`Raid cleanup by ${interaction.user.tag}`);
                    await antiRaidService?.updateStats?.(interaction.guild.id, 'kick');
                } else {
                    await member.ban({ 
                        reason: `Raid cleanup by ${interaction.user.tag}`,
                        deleteMessageSeconds: 60 * 60 * 24 // 24 hours
                    });
                    await antiRaidService?.updateStats?.(interaction.guild.id, 'ban');
                }
                
                results.success++;
                
                // Delay to avoid rate limits
                await new Promise(r => setTimeout(r, 500));
                
            } catch {
                results.failed++;
            }
        }
        
        await interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setColor(moderationConfig?.COLORS?.SUCCESS || 0x00FF00)
                    .setTitle(`🧹 Raid Cleanup Complete`)
                    .setDescription(`Action: **${action === 'kick' ? 'Kicked' : 'Banned'}**`)
                    .addFields(
                        { name: '✅ Success', value: `${results.success}`, inline: true },
                        { name: '❌ Failed', value: `${results.failed}`, inline: true },
                        { name: '⏭️ Skipped', value: `${results.notFound}`, inline: true }
                    )
                    .setTimestamp()
            ]
        });
    }
}

export default new RaidCommand();
