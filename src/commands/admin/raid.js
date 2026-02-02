/**
 * Raid Command
 * Manage anti-raid mode
 * @module commands/admin/raid
 */

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { BaseCommand } = require('../BaseCommand');
const AntiRaidService = require('../../services/moderation/AntiRaidService');
const LockdownService = require('../../services/moderation/LockdownService');
const moderationConfig = require('../../config/features/moderation');

class RaidCommand extends BaseCommand {
    constructor() {
        super('raid');
    }

    data = new SlashCommandBuilder()
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

    async run(interaction) {
        const subcommand = interaction.options.getSubcommand();
        
        switch (subcommand) {
            case 'on':
                return this._activateRaidMode(interaction);
            case 'off':
                return this._deactivateRaidMode(interaction);
            case 'status':
                return this._showStatus(interaction);
            case 'clean':
                return this._cleanRaiders(interaction);
        }
    }
    
    /**
     * Activate raid mode
     */
    async _activateRaidMode(interaction) {
        const reason = interaction.options.getString('reason') || 'Manual activation';
        const lockdown = interaction.options.getBoolean('lockdown') ?? false;
        
        // Check if already active
        if (AntiRaidService.isRaidModeActive(interaction.guild.id)) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(moderationConfig.COLORS.WARNING)
                        .setDescription(`${moderationConfig.EMOJIS.WARNING} Raid mode is already active!`)
                ],
                ephemeral: true
            });
        }
        
        await interaction.deferReply();
        
        // Activate raid mode
        AntiRaidService.activateRaidMode(
            interaction.guild.id,
            interaction.user.id,
            reason
        );
        
        const embed = new EmbedBuilder()
            .setColor(moderationConfig.COLORS.RAID)
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
            const lockResults = await LockdownService.lockServer(
                interaction.guild,
                `Raid lockdown | ${reason}`
            );
            
            embed.addFields({
                name: '🔒 Server Lockdown',
                value: `${lockResults.success.length} channels locked`,
                inline: true
            });
        }
        
        return interaction.editReply({ embeds: [embed] });
    }
    
    /**
     * Deactivate raid mode
     */
    async _deactivateRaidMode(interaction) {
        const unlock = interaction.options.getBoolean('unlock') ?? false;
        
        // Check if active
        if (!AntiRaidService.isRaidModeActive(interaction.guild.id)) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(moderationConfig.COLORS.INFO)
                        .setDescription(`${moderationConfig.EMOJIS.INFO} Raid mode is not active.`)
                ],
                ephemeral: true
            });
        }
        
        await interaction.deferReply();
        
        const result = AntiRaidService.deactivateRaidMode(interaction.guild.id);
        
        const durationMinutes = Math.floor(result.duration / 60000);
        
        const embed = new EmbedBuilder()
            .setColor(moderationConfig.COLORS.SUCCESS)
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
            const unlockResults = await LockdownService.unlockServer(
                interaction.guild,
                'Raid ended'
            );
            
            embed.addFields({
                name: '🔓 Server Unlocked',
                value: `${unlockResults.success.length} channels unlocked`,
                inline: false
            });
        }
        
        return interaction.editReply({ embeds: [embed] });
    }
    
    /**
     * Show raid mode status
     */
    async _showStatus(interaction) {
        const state = AntiRaidService.getRaidModeState(interaction.guild.id);
        const flagged = AntiRaidService.getFlaggedAccounts(interaction.guild.id);
        const lockStatus = LockdownService.getLockStatus(interaction.guild.id);
        
        if (!state?.active) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(moderationConfig.COLORS.SUCCESS)
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
        }
        
        const durationMinutes = Math.floor((Date.now() - state.activatedAt) / 60000);
        const activatedBy = state.activatedBy === 'system' 
            ? 'System (Auto-detected)' 
            : `<@${state.activatedBy}>`;
        
        return interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(moderationConfig.COLORS.RAID)
                    .setTitle('🛡️ Raid Mode ACTIVE')
                    .addFields(
                        { name: 'Activated By', value: activatedBy, inline: true },
                        { name: 'Duration', value: `${durationMinutes} minutes`, inline: true },
                        { name: 'Reason', value: state.reason, inline: false },
                        { name: 'Flagged Users', value: `${flagged.size}`, inline: true },
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
    async _cleanRaiders(interaction) {
        const action = interaction.options.getString('action');
        
        const flagged = AntiRaidService.getFlaggedAccounts(interaction.guild.id);
        
        if (flagged.size === 0) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(moderationConfig.COLORS.INFO)
                        .setDescription(`${moderationConfig.EMOJIS.INFO} No flagged users to clean.`)
                ],
                ephemeral: true
            });
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
                    AntiRaidService.updateStats(interaction.guild.id, 'kick');
                } else {
                    await member.ban({ 
                        reason: `Raid cleanup by ${interaction.user.tag}`,
                        deleteMessageSeconds: 60 * 60 * 24 // 24 hours
                    });
                    AntiRaidService.updateStats(interaction.guild.id, 'ban');
                }
                
                results.success++;
                
                // Delay to avoid rate limits
                await new Promise(r => setTimeout(r, 500));
                
            } catch {
                results.failed++;
            }
        }
        
        return interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setColor(moderationConfig.COLORS.SUCCESS)
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

module.exports = new RaidCommand();
