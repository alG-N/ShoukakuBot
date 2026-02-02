/**
 * Warn Command
 * Issue a warning to a user with settings panel
 * @module commands/admin/warn
 */

const { 
    SlashCommandBuilder, 
    PermissionFlagsBits, 
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');
const { BaseCommand } = require('../BaseCommand');
const { InfractionService, ModerationService } = require('../../services/moderation');
const moderationConfig = require('../../config/features/moderation');
const { formatDuration } = require('../../utils/common/time');
const db = require('../../database');

class WarnCommand extends BaseCommand {
    constructor() {
        super({
            name: 'warn',
            description: 'Issue a warning to a user',
            category: 'admin',
            permissions: ['ModerateMembers'],
            cooldown: 3000
        });
    }

    /**
     * Get slash command data
     */
    get data() {
        return this.buildSlashCommand();
    }

    /**
     * Build slash command
     */
    buildSlashCommand() {
        return new SlashCommandBuilder()
            .setName('warn')
            .setDescription('Warning system commands')
            .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
            .addSubcommand(sub => sub
                .setName('user')
                .setDescription('Issue a warning to a user')
                .addUserOption(option =>
                    option.setName('target')
                        .setDescription('User to warn')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('reason')
                        .setDescription('Reason for the warning')
                        .setRequired(false)
                        .setMaxLength(500))
                .addBooleanOption(option =>
                    option.setName('silent')
                        .setDescription('Do not DM the user')
                        .setRequired(false)))
            .addSubcommand(sub => sub
                .setName('setting')
                .setDescription('Configure warning escalation thresholds'));
    }

    /**
     * Execute command
     */
    async run(interaction) {
        const subcommand = interaction.options.getSubcommand();
        
        if (subcommand === 'setting') {
            return this.runSettings(interaction);
        }
        
        return this.runWarn(interaction);
    }

    /**
     * Run warn user subcommand
     */
    async runWarn(interaction) {
        const target = interaction.options.getMember('target');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const silent = interaction.options.getBoolean('silent') || false;

        // Validation
        if (!target) {
            return interaction.reply({
                content: '❌ User not found in this server.',
                ephemeral: true
            });
        }

        if (target.id === interaction.user.id) {
            return interaction.reply({
                content: '❌ You cannot warn yourself.',
                ephemeral: true
            });
        }

        if (target.id === interaction.client.user.id) {
            return interaction.reply({
                content: '❌ I cannot warn myself.',
                ephemeral: true
            });
        }

        // Check role hierarchy
        if (target.roles.highest.position >= interaction.member.roles.highest.position &&
            interaction.user.id !== interaction.guild.ownerId) {
            return interaction.reply({
                content: '❌ You cannot warn someone with equal or higher role than you.',
                ephemeral: true
            });
        }

        await interaction.deferReply();

        try {
            // Create warning
            const result = await InfractionService.createWarning(
                interaction.guild,
                target.user,
                interaction.user,
                reason,
                {
                    metadata: {
                        channelId: interaction.channelId,
                        silent
                    }
                }
            );

            const { infraction, warnCount, escalation } = result;

            // Try to DM user (unless silent)
            let dmSent = false;
            if (!silent && moderationConfig.punishments.warnings.sendDM) {
                try {
                    const dmEmbed = new EmbedBuilder()
                        .setColor(moderationConfig.COLORS.WARN)
                        .setTitle(`${moderationConfig.EMOJIS.WARN} You have been warned`)
                        .setDescription(`You have received a warning in **${interaction.guild.name}**`)
                        .addFields(
                            { name: 'Reason', value: reason },
                            { name: 'Warning Count', value: `${warnCount} active warning(s)`, inline: true },
                            { name: 'Moderator', value: interaction.user.tag, inline: true }
                        )
                        .setFooter({ text: 'Please follow the server rules to avoid further action.' })
                        .setTimestamp();

                    await target.send({ embeds: [dmEmbed] });
                    dmSent = true;
                } catch {
                    // User has DMs disabled
                }
            }

            // Build response embed
            const embed = new EmbedBuilder()
                .setColor(moderationConfig.COLORS.WARN)
                .setTitle(`${moderationConfig.EMOJIS.WARN} Warning Issued`)
                .addFields(
                    { name: 'User', value: `${target.user.tag} (<@${target.id}>)`, inline: true },
                    { name: 'Warning Count', value: `${warnCount}`, inline: true },
                    { name: 'Case ID', value: `#${infraction.case_id}`, inline: true },
                    { name: 'Reason', value: reason }
                )
                .setFooter({ text: `Warned by ${interaction.user.tag}${dmSent ? '' : ' • DM not sent'}` })
                .setTimestamp();

            // Handle escalation if triggered
            if (escalation) {
                const escalationResult = await this.handleEscalation(
                    interaction,
                    target,
                    escalation,
                    warnCount
                );

                if (escalationResult) {
                    embed.addFields({
                        name: '⚠️ Automatic Action',
                        value: escalationResult.message,
                        inline: false
                    });
                }
            }

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('[WarnCommand] Error:', error);
            await interaction.editReply({
                content: `❌ Failed to warn user: ${error.message}`
            });
        }
    }

    /**
     * Handle automatic escalation
     */
    async handleEscalation(interaction, target, escalation, warnCount) {
        try {
            switch (escalation.action) {
                case 'mute': {
                    const muteResult = await ModerationService.muteUser(
                        target,
                        interaction.member,
                        escalation.durationMs,
                        `${escalation.reason} (${warnCount} warnings)`
                    );
                    
                    if (muteResult.success) {
                        await InfractionService.logMute(
                            interaction.guild,
                            target.user,
                            interaction.client.user,
                            escalation.reason,
                            escalation.durationMs
                        );
                        return {
                            success: true,
                            message: `🔇 User has been automatically muted for ${formatDuration(escalation.durationMs)} (${warnCount} warnings)`
                        };
                    }
                    break;
                }

                case 'kick': {
                    const kickResult = await ModerationService.kickUser(
                        target,
                        interaction.member,
                        `${escalation.reason} (${warnCount} warnings)`
                    );
                    
                    if (kickResult.success) {
                        await InfractionService.logKick(
                            interaction.guild,
                            target.user,
                            interaction.client.user,
                            escalation.reason
                        );
                        return {
                            success: true,
                            message: `👢 User has been automatically kicked (${warnCount} warnings)`
                        };
                    }
                    break;
                }

                case 'ban': {
                    const banResult = await ModerationService.banUser(
                        target,
                        interaction.member,
                        `${escalation.reason} (${warnCount} warnings)`
                    );
                    
                    if (banResult.success) {
                        await InfractionService.logBan(
                            interaction.guild,
                            target.user,
                            interaction.client.user,
                            escalation.reason
                        );
                        return {
                            success: true,
                            message: `🔨 User has been automatically banned (${warnCount} warnings)`
                        };
                    }
                    break;
                }
            }
        } catch (error) {
            console.error('[WarnCommand] Escalation error:', error);
        }

        return null;
    }

    // ==========================================
    // WARN SETTINGS PANEL
    // ==========================================
    
    /**
     * Run warn settings panel
     */
    async runSettings(interaction) {
        await interaction.deferReply({ ephemeral: true });
        
        const thresholds = await this.getThresholds(interaction.guildId);
        
        const embed = this.buildSettingsEmbed(thresholds);
        const components = this.buildSettingsComponents(thresholds);
        
        const response = await interaction.editReply({
            embeds: [embed],
            components
        });
        
        this._setupSettingsCollector(response, interaction);
    }
    
    /**
     * Get warning thresholds from database
     */
    async getThresholds(guildId) {
        const result = await db.query(
            'SELECT * FROM warn_thresholds WHERE guild_id = $1 ORDER BY warn_count ASC',
            [guildId]
        );
        return result.rows;
    }
    
    /**
     * Build settings embed
     */
    buildSettingsEmbed(thresholds) {
        const lines = thresholds.length > 0
            ? thresholds.map(t => {
                const durationText = t.action === 'mute' && t.duration_ms 
                    ? ` (${formatDuration(t.duration_ms)})` 
                    : '';
                return `• **${t.warn_count} warns** → ${this.getActionEmoji(t.action)} ${t.action}${durationText}`;
            })
            : ['*No thresholds configured. Using defaults:*',
               '• **3 warns** → 🔇 mute (1 hour)',
               '• **5 warns** → 👢 kick',
               '• **7 warns** → 🔨 ban'];
        
        return new EmbedBuilder()
            .setColor(moderationConfig.COLORS.WARN)
            .setTitle('⚠️ Warning Escalation Settings')
            .setDescription([
                'Configure automatic actions when users reach warning thresholds.',
                '',
                '**Current Thresholds:**',
                ...lines,
                '',
                'Use the buttons below to add, edit, or remove thresholds.'
            ].join('\n'))
            .setFooter({ text: 'Thresholds are checked when /warn user is used' })
            .setTimestamp();
    }
    
    /**
     * Get action emoji
     */
    getActionEmoji(action) {
        const emojis = { mute: '🔇', kick: '👢', ban: '🔨' };
        return emojis[action] || '⚡';
    }
    
    /**
     * Build settings components
     */
    buildSettingsComponents(thresholds) {
        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('warn_add_threshold')
                .setLabel('Add Threshold')
                .setEmoji('➕')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('warn_reset_defaults')
                .setLabel('Reset to Defaults')
                .setEmoji('🔄')
                .setStyle(ButtonStyle.Secondary)
        );
        
        const rows = [row1];
        
        // Add edit/delete buttons if thresholds exist
        if (thresholds.length > 0) {
            const options = thresholds.map(t => ({
                label: `${t.warn_count} warns → ${t.action}`,
                value: `${t.warn_count}`,
                emoji: this.getActionEmoji(t.action)
            }));
            
            const row2 = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('warn_select_threshold')
                    .setPlaceholder('Select a threshold to edit/delete')
                    .addOptions(options)
            );
            rows.push(row2);
        }
        
        return rows;
    }
    
    /**
     * Setup settings collector
     */
    _setupSettingsCollector(response, interaction) {
        const collector = response.createMessageComponentCollector({
            filter: i => i.user.id === interaction.user.id,
            time: 300000 // 5 minutes
        });
        
        collector.on('collect', async (i) => {
            try {
                if (i.customId === 'warn_add_threshold') {
                    await this.showAddThresholdModal(i);
                } else if (i.customId === 'warn_reset_defaults') {
                    await i.deferUpdate();
                    await this.resetToDefaults(i.guildId);
                    const thresholds = await this.getThresholds(i.guildId);
                    await i.editReply({
                        embeds: [this.buildSettingsEmbed(thresholds)],
                        components: this.buildSettingsComponents(thresholds)
                    });
                } else if (i.customId === 'warn_select_threshold') {
                    const warnCount = parseInt(i.values[0]);
                    await this.showEditThresholdModal(i, warnCount);
                } else if (i.customId === 'warn_delete_threshold') {
                    await i.deferUpdate();
                    const warnCount = parseInt(i.values[0]);
                    await this.deleteThreshold(i.guildId, warnCount);
                    const thresholds = await this.getThresholds(i.guildId);
                    await i.editReply({
                        embeds: [this.buildSettingsEmbed(thresholds)],
                        components: this.buildSettingsComponents(thresholds)
                    });
                }
            } catch (error) {
                console.error('[WarnCommand] Settings collector error:', error);
            }
        });
        
        // Handle modal submissions
        const modalFilter = i => i.user.id === interaction.user.id && 
            (i.customId === 'warn_add_modal' || i.customId.startsWith('warn_edit_modal_'));
        
        interaction.client.on('interactionCreate', async (modalInteraction) => {
            if (!modalInteraction.isModalSubmit()) return;
            if (!modalFilter(modalInteraction)) return;
            
            try {
                await modalInteraction.deferUpdate();
                
                const warnCount = parseInt(modalInteraction.fields.getTextInputValue('warn_count'));
                const action = modalInteraction.fields.getTextInputValue('action').toLowerCase();
                const durationInput = modalInteraction.fields.getTextInputValue('duration');
                
                // Validate
                if (isNaN(warnCount) || warnCount < 1 || warnCount > 20) {
                    return; // Invalid warn count
                }
                
                if (!['mute', 'kick', 'ban'].includes(action)) {
                    return; // Invalid action
                }
                
                // Parse duration for mute
                let durationMs = null;
                if (action === 'mute' && durationInput) {
                    durationMs = this.parseDuration(durationInput);
                }
                
                // Upsert threshold
                await this.upsertThreshold(modalInteraction.guildId, warnCount, action, durationMs);
                
                const thresholds = await this.getThresholds(modalInteraction.guildId);
                await modalInteraction.editReply({
                    embeds: [this.buildSettingsEmbed(thresholds)],
                    components: this.buildSettingsComponents(thresholds)
                });
            } catch (error) {
                console.error('[WarnCommand] Modal error:', error);
            }
        });
        
        collector.on('end', () => {
            interaction.editReply({ components: [] }).catch(() => {});
        });
    }
    
    /**
     * Show add threshold modal
     */
    async showAddThresholdModal(interaction) {
        const modal = new ModalBuilder()
            .setCustomId('warn_add_modal')
            .setTitle('Add Warning Threshold');
        
        const warnCountInput = new TextInputBuilder()
            .setCustomId('warn_count')
            .setLabel('Warning Count (1-20)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g., 3')
            .setRequired(true)
            .setMaxLength(2);
        
        const actionInput = new TextInputBuilder()
            .setCustomId('action')
            .setLabel('Action (mute, kick, or ban)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('mute')
            .setRequired(true)
            .setMaxLength(10);
        
        const durationInput = new TextInputBuilder()
            .setCustomId('duration')
            .setLabel('Duration for mute (e.g., 1h, 30m, 1d)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('1h (leave empty for kick/ban)')
            .setRequired(false)
            .setMaxLength(10);
        
        modal.addComponents(
            new ActionRowBuilder().addComponents(warnCountInput),
            new ActionRowBuilder().addComponents(actionInput),
            new ActionRowBuilder().addComponents(durationInput)
        );
        
        await interaction.showModal(modal);
    }
    
    /**
     * Show edit threshold modal
     */
    async showEditThresholdModal(interaction, warnCount) {
        const existing = await db.query(
            'SELECT * FROM warn_thresholds WHERE guild_id = $1 AND warn_count = $2',
            [interaction.guildId, warnCount]
        );
        
        const threshold = existing.rows[0];
        
        const modal = new ModalBuilder()
            .setCustomId(`warn_edit_modal_${warnCount}`)
            .setTitle(`Edit Threshold: ${warnCount} Warns`);
        
        const warnCountInput = new TextInputBuilder()
            .setCustomId('warn_count')
            .setLabel('Warning Count (1-20)')
            .setStyle(TextInputStyle.Short)
            .setValue(warnCount.toString())
            .setRequired(true)
            .setMaxLength(2);
        
        const actionInput = new TextInputBuilder()
            .setCustomId('action')
            .setLabel('Action (mute, kick, or ban)')
            .setStyle(TextInputStyle.Short)
            .setValue(threshold?.action || 'mute')
            .setRequired(true)
            .setMaxLength(10);
        
        const durationInput = new TextInputBuilder()
            .setCustomId('duration')
            .setLabel('Duration for mute (e.g., 1h, 30m, 1d)')
            .setStyle(TextInputStyle.Short)
            .setValue(threshold?.duration_ms ? this.formatDurationInput(threshold.duration_ms) : '')
            .setRequired(false)
            .setMaxLength(10);
        
        modal.addComponents(
            new ActionRowBuilder().addComponents(warnCountInput),
            new ActionRowBuilder().addComponents(actionInput),
            new ActionRowBuilder().addComponents(durationInput)
        );
        
        await interaction.showModal(modal);
    }
    
    /**
     * Parse duration string to milliseconds
     */
    parseDuration(input) {
        const match = input.match(/^(\d+)(m|h|d)$/i);
        if (!match) return 60 * 60 * 1000; // Default 1 hour
        
        const value = parseInt(match[1]);
        const unit = match[2].toLowerCase();
        
        const multipliers = {
            m: 60 * 1000,
            h: 60 * 60 * 1000,
            d: 24 * 60 * 60 * 1000
        };
        
        return value * multipliers[unit];
    }
    
    /**
     * Format duration for input field
     */
    formatDurationInput(ms) {
        const hours = ms / (60 * 60 * 1000);
        if (hours >= 24 && hours % 24 === 0) return `${hours / 24}d`;
        if (hours >= 1) return `${hours}h`;
        return `${ms / (60 * 1000)}m`;
    }
    
    /**
     * Upsert threshold
     */
    async upsertThreshold(guildId, warnCount, action, durationMs) {
        await db.query(`
            INSERT INTO warn_thresholds (guild_id, warn_count, action, duration_ms)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (guild_id, warn_count) 
            DO UPDATE SET action = $3, duration_ms = $4
        `, [guildId, warnCount, action, durationMs]);
    }
    
    /**
     * Delete threshold
     */
    async deleteThreshold(guildId, warnCount) {
        await db.query(
            'DELETE FROM warn_thresholds WHERE guild_id = $1 AND warn_count = $2',
            [guildId, warnCount]
        );
    }
    
    /**
     * Reset to defaults
     */
    async resetToDefaults(guildId) {
        await db.query('DELETE FROM warn_thresholds WHERE guild_id = $1', [guildId]);
        
        const defaults = [
            { warn_count: 3, action: 'mute', duration_ms: 60 * 60 * 1000 },
            { warn_count: 5, action: 'kick', duration_ms: null },
            { warn_count: 7, action: 'ban', duration_ms: null }
        ];
        
        for (const d of defaults) {
            await db.query(`
                INSERT INTO warn_thresholds (guild_id, warn_count, action, duration_ms)
                VALUES ($1, $2, $3, $4)
            `, [guildId, d.warn_count, d.action, d.duration_ms]);
        }
    }
}

module.exports = new WarnCommand();
