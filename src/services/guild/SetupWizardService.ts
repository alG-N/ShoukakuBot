/**
 * Setup Wizard Service
 * Guides new server owners through bot configuration
 * @module services/guild/SetupWizardService
 */

import {
    Guild,
    TextChannel,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ComponentType,
    ButtonInteraction,
    StringSelectMenuInteraction,
    ChannelType,
    Message,
    PermissionFlagsBits
} from 'discord.js';
import { COLORS } from '../../constants.js';
import logger from '../../core/Logger.js';

/**
 * Setup step types
 */
type SetupStep = 'welcome' | 'automod' | 'features' | 'complete';

/**
 * AutoMod feature options
 */
interface AutoModOptions {
    antiSpam: boolean;
    antiInvite: boolean;
    antiCaps: boolean;
    antiMassMention: boolean;
    badWordFilter: boolean;
}

/**
 * Setup Wizard Service Class
 */
export class SetupWizardService {
    private static instance: SetupWizardService;

    private constructor() {}

    static getInstance(): SetupWizardService {
        if (!SetupWizardService.instance) {
            SetupWizardService.instance = new SetupWizardService();
        }
        return SetupWizardService.instance;
    }

    /**
     * Start the setup wizard for a new guild
     */
    async startWizard(guild: Guild): Promise<void> {
        try {
            // Find a suitable channel to send the setup message
            const channel = await this.findWelcomeChannel(guild);
            if (!channel) {
                logger.warn('SetupWizard', `Could not find suitable channel in ${guild.name}`);
                return;
            }

            // Check if bot has permission to send messages
            if (!channel.permissionsFor(guild.members.me!)?.has(PermissionFlagsBits.SendMessages)) {
                logger.warn('SetupWizard', `No permission to send messages in ${channel.name}`);
                return;
            }

            // Send welcome message with setup options
            const welcomeEmbed = this.buildWelcomeEmbed(guild);
            const welcomeButtons = this.buildWelcomeButtons();

            const message = await channel.send({
                embeds: [welcomeEmbed],
                components: [welcomeButtons]
            });

            // Create collector for button interactions
            this.createWelcomeCollector(message, guild);

        } catch (error) {
            logger.error('SetupWizard', `Failed to start wizard for ${guild.name}:`, { error: error instanceof Error ? error.message : String(error) });
        }
    }

    /**
     * Find the best channel to send the welcome/setup message
     */
    private async findWelcomeChannel(guild: Guild): Promise<TextChannel | null> {
        // Priority: system channel > general > first text channel with permissions
        const systemChannel = guild.systemChannel;
        if (systemChannel && this.canSendMessages(guild, systemChannel)) {
            return systemChannel;
        }

        // Look for common welcome channel names
        const welcomeNames = ['welcome', 'general', 'chat', 'main', 'lobby'];
        for (const name of welcomeNames) {
            const channel = guild.channels.cache.find(
                c => c.type === ChannelType.GuildText && 
                     c.name.toLowerCase().includes(name) &&
                     this.canSendMessages(guild, c as TextChannel)
            ) as TextChannel | undefined;
            
            if (channel) return channel;
        }

        // Fallback to first text channel bot can send to
        return guild.channels.cache.find(
            c => c.type === ChannelType.GuildText && 
                 this.canSendMessages(guild, c as TextChannel)
        ) as TextChannel | null;
    }

    /**
     * Check if bot can send messages in a channel
     */
    private canSendMessages(guild: Guild, channel: TextChannel): boolean {
        const me = guild.members.me;
        if (!me) return false;
        return channel.permissionsFor(me)?.has([
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.EmbedLinks
        ]) ?? false;
    }

    /**
     * Build the welcome embed
     */
    private buildWelcomeEmbed(guild: Guild): EmbedBuilder {
        return new EmbedBuilder()
            .setTitle('🎉 Thanks for adding Shoukaku!')
            .setColor(COLORS.SUCCESS)
            .setDescription(
                `Hey **${guild.name}**! I'm Shoukaku, your new multi-purpose bot! 🤖\n\n` +
                '**What I can do:**\n' +
                '> 🎬 Download videos from TikTok, YouTube, Twitter & more\n' +
                '> 🎵 Play music in voice channels\n' +
                '> ⚔️ Fun games like DeathBattle\n' +
                '> 🛡️ Auto-moderation to keep your server safe\n' +
                '> 📋 And much more!\n\n' +
                '**Would you like to set up the bot now?**\n' +
                'Click **Setup** to configure auto-moderation and explore features,\n' +
                'or click **Skip** if you want to configure later.'
            )
            .setThumbnail(guild.client.user?.displayAvatarURL() ?? null)
            .setFooter({ text: 'Use /help anytime to see all commands!' })
            .setTimestamp();
    }

    /**
     * Build welcome buttons
     */
    private buildWelcomeButtons(): ActionRowBuilder<ButtonBuilder> {
        return new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId('setup_start')
                .setLabel('🚀 Setup')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('setup_skip')
                .setLabel('Skip')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('setup_help')
                .setLabel('📚 Quick Help')
                .setStyle(ButtonStyle.Primary)
        );
    }

    /**
     * Create collector for welcome message buttons
     */
    private createWelcomeCollector(message: Message, guild: Guild): void {
        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 600000 // 10 minutes
        });

        collector.on('collect', async (interaction: ButtonInteraction) => {
            // Only allow server admins to use setup
            if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
                await interaction.reply({
                    content: '❌ Only server administrators can use the setup wizard.',
                    ephemeral: true
                });
                return;
            }

            switch (interaction.customId) {
                case 'setup_start':
                    collector.stop('setup_started');
                    await this.showAutoModSetup(interaction, message);
                    break;

                case 'setup_skip':
                    collector.stop('skipped');
                    await interaction.update({
                        embeds: [
                            new EmbedBuilder()
                                .setTitle('✅ Setup Skipped')
                                .setColor(COLORS.INFO)
                                .setDescription(
                                    'No problem! You can set up the bot anytime using:\n\n' +
                                    '> `/automod` - Configure auto-moderation\n' +
                                    '> `/setting` - Server settings\n' +
                                    '> `/help` - View all commands\n\n' +
                                    '*This message will be deleted in 30 seconds.*'
                                )
                        ],
                        components: []
                    });
                    // Delete message after 30 seconds
                    setTimeout(() => message.delete().catch(() => {}), 30000);
                    break;

                case 'setup_help':
                    await this.showQuickHelp(interaction);
                    break;
            }
        });

        collector.on('end', async (_collected, reason) => {
            if (reason === 'time') {
                // Timeout - update message
                await message.edit({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('⏰ Setup Timed Out')
                            .setColor(COLORS.WARNING)
                            .setDescription(
                                'The setup wizard has timed out.\n' +
                                'Use `/help` to see commands or `/automod` to configure moderation.'
                            )
                    ],
                    components: []
                }).catch(() => {});
            }
        });
    }

    /**
     * Show auto-mod setup menu
     */
    private async showAutoModSetup(interaction: ButtonInteraction, originalMessage: Message): Promise<void> {
        const embed = new EmbedBuilder()
            .setTitle('🛡️ Auto-Moderation Setup')
            .setColor(COLORS.INFO)
            .setDescription(
                '**Select the features you want to enable:**\n\n' +
                '> 🚫 **Anti-Spam** - Prevent message spam\n' +
                '> 🔗 **Anti-Invite** - Block Discord invite links\n' +
                '> 🔠 **Anti-Caps** - Limit excessive caps usage\n' +
                '> 👥 **Anti-Mass Mention** - Prevent mass mentions\n' +
                '> 🤬 **Bad Word Filter** - Filter inappropriate words\n\n' +
                '*Select features below, then click Apply*'
            );

        const selectMenu = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('setup_automod_select')
                .setPlaceholder('Select features to enable...')
                .setMinValues(0)
                .setMaxValues(5)
                .addOptions([
                    new StringSelectMenuOptionBuilder()
                        .setLabel('Anti-Spam')
                        .setDescription('Prevent users from spamming messages')
                        .setValue('antiSpam')
                        .setEmoji('🚫'),
                    new StringSelectMenuOptionBuilder()
                        .setLabel('Anti-Invite')
                        .setDescription('Automatically delete Discord invite links')
                        .setValue('antiInvite')
                        .setEmoji('🔗'),
                    new StringSelectMenuOptionBuilder()
                        .setLabel('Anti-Caps')
                        .setDescription('Warn users for excessive caps usage')
                        .setValue('antiCaps')
                        .setEmoji('🔠'),
                    new StringSelectMenuOptionBuilder()
                        .setLabel('Anti-Mass Mention')
                        .setDescription('Prevent mass @mentions')
                        .setValue('antiMassMention')
                        .setEmoji('👥'),
                    new StringSelectMenuOptionBuilder()
                        .setLabel('Bad Word Filter')
                        .setDescription('Filter inappropriate words')
                        .setValue('badWordFilter')
                        .setEmoji('🤬')
                ])
        );

        const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId('setup_automod_apply')
                .setLabel('✅ Apply Settings')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('setup_automod_skip')
                .setLabel('Skip Auto-Mod')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('setup_automod_all')
                .setLabel('Enable All')
                .setStyle(ButtonStyle.Primary)
        );

        await interaction.update({
            embeds: [embed],
            components: [selectMenu, buttons]
        });

        // Handle auto-mod selection
        this.createAutoModCollector(originalMessage, interaction.guild!);
    }

    /**
     * Create collector for auto-mod setup
     */
    private createAutoModCollector(message: Message, guild: Guild): void {
        let selectedFeatures: string[] = [];

        const collector = message.createMessageComponentCollector({
            time: 300000 // 5 minutes
        });

        collector.on('collect', async (interaction: ButtonInteraction | StringSelectMenuInteraction) => {
            // Check permissions
            if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
                await interaction.reply({
                    content: '❌ Only server administrators can use the setup wizard.',
                    ephemeral: true
                });
                return;
            }

            if (interaction.isStringSelectMenu() && interaction.customId === 'setup_automod_select') {
                selectedFeatures = interaction.values;
                await interaction.deferUpdate();
                return;
            }

            if (interaction.isButton()) {
                switch (interaction.customId) {
                    case 'setup_automod_all':
                        selectedFeatures = ['antiSpam', 'antiInvite', 'antiCaps', 'antiMassMention', 'badWordFilter'];
                        await interaction.reply({
                            content: '✅ All features selected! Click **Apply Settings** to enable them.',
                            ephemeral: true
                        });
                        break;

                    case 'setup_automod_apply':
                        collector.stop('applied');
                        await this.applyAutoModSettings(interaction, guild, selectedFeatures);
                        break;

                    case 'setup_automod_skip':
                        collector.stop('skipped');
                        await this.showFeaturesOverview(interaction, message);
                        break;
                }
            }
        });
    }

    /**
     * Apply auto-mod settings
     */
    private async applyAutoModSettings(
        interaction: ButtonInteraction, 
        guild: Guild, 
        features: string[]
    ): Promise<void> {
        try {
            // Import the database service dynamically to avoid circular deps
            const { postgres: db } = await import('../../database/index.js');

            // Build the automod settings object - use correct column names from schema
            const settings: Record<string, boolean | string> = {
                guild_id: guild.id,
                enabled: features.length > 0,
                spam_enabled: features.includes('antiSpam'),
                invites_enabled: features.includes('antiInvite'),
                caps_enabled: features.includes('antiCaps'),
                mention_enabled: features.includes('antiMassMention'),
                filter_enabled: features.includes('badWordFilter')
            };

            // Upsert to database (table, data, conflictKey)
            await db.upsert('automod_settings', settings, 'guild_id');

            const enabledList = features.length > 0 
                ? features.map(f => {
                    const labels: Record<string, string> = {
                        antiSpam: '🚫 Anti-Spam',
                        antiInvite: '🔗 Anti-Invite',
                        antiCaps: '🔠 Anti-Caps',
                        antiMassMention: '👥 Anti-Mass Mention',
                        badWordFilter: '🤬 Bad Word Filter'
                    };
                    return `> ${labels[f]}`;
                }).join('\n')
                : '> *No features enabled*';

            const embed = new EmbedBuilder()
                .setTitle('✅ Auto-Moderation Configured!')
                .setColor(COLORS.SUCCESS)
                .setDescription(
                    '**Enabled Features:**\n' +
                    enabledList + '\n\n' +
                    '**Next Steps:**\n' +
                    '> Use `/automod` to fine-tune settings\n' +
                    '> Use `/filter add [word]` to add custom filters\n' +
                    '> Use `/modlog channel [#channel]` to set log channel'
                );

            await interaction.update({
                embeds: [embed],
                components: [
                    new ActionRowBuilder<ButtonBuilder>().addComponents(
                        new ButtonBuilder()
                            .setCustomId('setup_continue_features')
                            .setLabel('Continue to Features →')
                            .setStyle(ButtonStyle.Primary),
                        new ButtonBuilder()
                            .setCustomId('setup_finish')
                            .setLabel('Finish Setup')
                            .setStyle(ButtonStyle.Secondary)
                    )
                ]
            });

            // Handle next step
            this.createFinalStepCollector(interaction.message as Message);

            logger.info('SetupWizard', `AutoMod configured for ${guild.name}: ${features.join(', ')}`);

        } catch (error) {
            logger.error('SetupWizard', 'Failed to apply automod settings:', { error: error instanceof Error ? error.message : String(error) });
            await interaction.update({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('❌ Setup Error')
                        .setColor(COLORS.ERROR)
                        .setDescription(
                            'Failed to save settings. Please try again or use `/automod` manually.\n\n' +
                            `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
                        )
                ],
                components: []
            });
        }
    }

    /**
     * Create collector for final step buttons
     */
    private createFinalStepCollector(message: Message): void {
        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 120000
        });

        collector.on('collect', async (interaction: ButtonInteraction) => {
            if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
                await interaction.reply({
                    content: '❌ Only server administrators can use the setup wizard.',
                    ephemeral: true
                });
                return;
            }

            if (interaction.customId === 'setup_continue_features') {
                collector.stop();
                await this.showFeaturesOverview(interaction, message);
            } else if (interaction.customId === 'setup_finish') {
                collector.stop();
                await this.showSetupComplete(interaction);
            }
        });
    }

    /**
     * Show features overview
     */
    private async showFeaturesOverview(interaction: ButtonInteraction, _message: Message): Promise<void> {
        const embed = new EmbedBuilder()
            .setTitle('🎯 Feature Overview')
            .setColor(COLORS.INFO)
            .setDescription('Here\'s what Shoukaku can do for your server:')
            .addFields(
                {
                    name: '🎬 Media Downloads',
                    value: '`/download [url]` - Download from TikTok, YouTube, Twitter, Instagram & more!\nSupports direct links and quality options.',
                    inline: false
                },
                {
                    name: '🎵 Music Player',
                    value: '`/music play [song]` - Full music bot with queue, loop, shuffle, lyrics & more!\nPlay from YouTube, Spotify, SoundCloud.',
                    inline: false
                },
                {
                    name: '⚔️ DeathBattle',
                    value: '`/deathbattle [@user]` - Epic anime battles!\nChoose skillsets from various anime and fight other users.',
                    inline: false
                },
                {
                    name: '🛡️ Moderation',
                    value: '`/kick` `/ban` `/mute` `/warn`\nFull moderation suite with logging.',
                    inline: false
                },
                {
                    name: '📋 Utilities',
                    value: '`/avatar` `/serverinfo` `/afk` and more utility commands.',
                    inline: false
                }
            )
            .setFooter({ text: 'Use /help for the complete command list!' });

        await interaction.update({
            embeds: [embed],
            components: [
                new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder()
                        .setCustomId('setup_finish')
                        .setLabel('✅ Complete Setup')
                        .setStyle(ButtonStyle.Success)
                )
            ]
        });

        // Handle finish button
        const collector = (interaction.message as Message).createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 60000,
            max: 1
        });

        collector.on('collect', async (btnInteraction: ButtonInteraction) => {
            if (btnInteraction.customId === 'setup_finish') {
                await this.showSetupComplete(btnInteraction);
            }
        });
    }

    /**
     * Show setup complete message
     */
    private async showSetupComplete(interaction: ButtonInteraction): Promise<void> {
        const embed = new EmbedBuilder()
            .setTitle('🎉 Setup Complete!')
            .setColor(COLORS.SUCCESS)
            .setDescription(
                '**Shoukaku is ready to use!**\n\n' +
                '**Quick Commands:**\n' +
                '> `/help` - View all commands\n' +
                '> `/download [url]` - Download a video\n' +
                '> `/music play [song]` - Play music\n' +
                '> `/automod` - Adjust moderation settings\n\n' +
                '**Need Help?**\n' +
                '> Join our support server or use `/report`\n\n' +
                '*Have fun using Shoukaku!* 🤖✨'
            )
            .setTimestamp();

        await interaction.update({
            embeds: [embed],
            components: []
        });

        // Delete after 60 seconds
        setTimeout(() => {
            (interaction.message as Message).delete().catch(() => {});
        }, 60000);
    }

    /**
     * Show quick help (ephemeral)
     */
    private async showQuickHelp(interaction: ButtonInteraction): Promise<void> {
        const embed = new EmbedBuilder()
            .setTitle('📚 Quick Help')
            .setColor(COLORS.INFO)
            .setDescription(
                '**Essential Commands:**\n\n' +
                '🎬 `/video [url]` - Download videos\n' +
                '🎵 `/music play [query]` - Play music\n' +
                '⚔️ `/deathbattle [@user]` - Anime battles\n' +
                '🛡️ `/automod` - Configure moderation\n' +
                '📋 `/help` - Full command list\n\n' +
                '*Click Setup to configure the bot, or Skip to use default settings.*'
            );

        await interaction.reply({
            embeds: [embed],
            ephemeral: true
        });
    }
}

// Export singleton
export const setupWizardService = SetupWizardService.getInstance();
export default setupWizardService;
