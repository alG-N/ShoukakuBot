"use strict";
/**
 * Setup Wizard Service
 * Guides new server owners through bot configuration
 * @module services/guild/SetupWizardService
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupWizardService = exports.SetupWizardService = void 0;
const discord_js_1 = require("discord.js");
const constants_1 = require("../../constants");
const Logger_1 = __importDefault(require("../../core/Logger"));
/**
 * Setup Wizard Service Class
 */
class SetupWizardService {
    static instance;
    constructor() { }
    static getInstance() {
        if (!SetupWizardService.instance) {
            SetupWizardService.instance = new SetupWizardService();
        }
        return SetupWizardService.instance;
    }
    /**
     * Start the setup wizard for a new guild
     */
    async startWizard(guild) {
        try {
            // Find a suitable channel to send the setup message
            const channel = await this.findWelcomeChannel(guild);
            if (!channel) {
                Logger_1.default.warn('SetupWizard', `Could not find suitable channel in ${guild.name}`);
                return;
            }
            // Check if bot has permission to send messages
            if (!channel.permissionsFor(guild.members.me)?.has(discord_js_1.PermissionFlagsBits.SendMessages)) {
                Logger_1.default.warn('SetupWizard', `No permission to send messages in ${channel.name}`);
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
        }
        catch (error) {
            Logger_1.default.error('SetupWizard', `Failed to start wizard for ${guild.name}:`, { error: error instanceof Error ? error.message : String(error) });
        }
    }
    /**
     * Find the best channel to send the welcome/setup message
     */
    async findWelcomeChannel(guild) {
        // Priority: system channel > general > first text channel with permissions
        const systemChannel = guild.systemChannel;
        if (systemChannel && this.canSendMessages(guild, systemChannel)) {
            return systemChannel;
        }
        // Look for common welcome channel names
        const welcomeNames = ['welcome', 'general', 'chat', 'main', 'lobby'];
        for (const name of welcomeNames) {
            const channel = guild.channels.cache.find(c => c.type === discord_js_1.ChannelType.GuildText &&
                c.name.toLowerCase().includes(name) &&
                this.canSendMessages(guild, c));
            if (channel)
                return channel;
        }
        // Fallback to first text channel bot can send to
        return guild.channels.cache.find(c => c.type === discord_js_1.ChannelType.GuildText &&
            this.canSendMessages(guild, c));
    }
    /**
     * Check if bot can send messages in a channel
     */
    canSendMessages(guild, channel) {
        const me = guild.members.me;
        if (!me)
            return false;
        return channel.permissionsFor(me)?.has([
            discord_js_1.PermissionFlagsBits.SendMessages,
            discord_js_1.PermissionFlagsBits.EmbedLinks
        ]) ?? false;
    }
    /**
     * Build the welcome embed
     */
    buildWelcomeEmbed(guild) {
        return new discord_js_1.EmbedBuilder()
            .setTitle('🎉 Thanks for adding alterGolden!')
            .setColor(constants_1.COLORS.SUCCESS)
            .setDescription(`Hey **${guild.name}**! I'm alterGolden, your new multi-purpose bot! 🤖\n\n` +
            '**What I can do:**\n' +
            '> 🎬 Download videos from TikTok, YouTube, Twitter & more\n' +
            '> 🎵 Play music in voice channels\n' +
            '> ⚔️ Fun games like DeathBattle\n' +
            '> 🛡️ Auto-moderation to keep your server safe\n' +
            '> 📋 And much more!\n\n' +
            '**Would you like to set up the bot now?**\n' +
            'Click **Setup** to configure auto-moderation and explore features,\n' +
            'or click **Skip** if you want to configure later.')
            .setThumbnail(guild.client.user?.displayAvatarURL() ?? null)
            .setFooter({ text: 'Use /help anytime to see all commands!' })
            .setTimestamp();
    }
    /**
     * Build welcome buttons
     */
    buildWelcomeButtons() {
        return new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder()
            .setCustomId('setup_start')
            .setLabel('🚀 Setup')
            .setStyle(discord_js_1.ButtonStyle.Success), new discord_js_1.ButtonBuilder()
            .setCustomId('setup_skip')
            .setLabel('Skip')
            .setStyle(discord_js_1.ButtonStyle.Secondary), new discord_js_1.ButtonBuilder()
            .setCustomId('setup_help')
            .setLabel('📚 Quick Help')
            .setStyle(discord_js_1.ButtonStyle.Primary));
    }
    /**
     * Create collector for welcome message buttons
     */
    createWelcomeCollector(message, guild) {
        const collector = message.createMessageComponentCollector({
            componentType: discord_js_1.ComponentType.Button,
            time: 600000 // 10 minutes
        });
        collector.on('collect', async (interaction) => {
            // Only allow server admins to use setup
            if (!interaction.memberPermissions?.has(discord_js_1.PermissionFlagsBits.Administrator)) {
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
                            new discord_js_1.EmbedBuilder()
                                .setTitle('✅ Setup Skipped')
                                .setColor(constants_1.COLORS.INFO)
                                .setDescription('No problem! You can set up the bot anytime using:\n\n' +
                                '> `/automod` - Configure auto-moderation\n' +
                                '> `/setting` - Server settings\n' +
                                '> `/help` - View all commands\n\n' +
                                '*This message will be deleted in 30 seconds.*')
                        ],
                        components: []
                    });
                    // Delete message after 30 seconds
                    setTimeout(() => message.delete().catch(() => { }), 30000);
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
                        new discord_js_1.EmbedBuilder()
                            .setTitle('⏰ Setup Timed Out')
                            .setColor(constants_1.COLORS.WARNING)
                            .setDescription('The setup wizard has timed out.\n' +
                            'Use `/help` to see commands or `/automod` to configure moderation.')
                    ],
                    components: []
                }).catch(() => { });
            }
        });
    }
    /**
     * Show auto-mod setup menu
     */
    async showAutoModSetup(interaction, originalMessage) {
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle('🛡️ Auto-Moderation Setup')
            .setColor(constants_1.COLORS.INFO)
            .setDescription('**Select the features you want to enable:**\n\n' +
            '> 🚫 **Anti-Spam** - Prevent message spam\n' +
            '> 🔗 **Anti-Invite** - Block Discord invite links\n' +
            '> 🔠 **Anti-Caps** - Limit excessive caps usage\n' +
            '> 👥 **Anti-Mass Mention** - Prevent mass mentions\n' +
            '> 🤬 **Bad Word Filter** - Filter inappropriate words\n\n' +
            '*Select features below, then click Apply*');
        const selectMenu = new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.StringSelectMenuBuilder()
            .setCustomId('setup_automod_select')
            .setPlaceholder('Select features to enable...')
            .setMinValues(0)
            .setMaxValues(5)
            .addOptions([
            new discord_js_1.StringSelectMenuOptionBuilder()
                .setLabel('Anti-Spam')
                .setDescription('Prevent users from spamming messages')
                .setValue('antiSpam')
                .setEmoji('🚫'),
            new discord_js_1.StringSelectMenuOptionBuilder()
                .setLabel('Anti-Invite')
                .setDescription('Automatically delete Discord invite links')
                .setValue('antiInvite')
                .setEmoji('🔗'),
            new discord_js_1.StringSelectMenuOptionBuilder()
                .setLabel('Anti-Caps')
                .setDescription('Warn users for excessive caps usage')
                .setValue('antiCaps')
                .setEmoji('🔠'),
            new discord_js_1.StringSelectMenuOptionBuilder()
                .setLabel('Anti-Mass Mention')
                .setDescription('Prevent mass @mentions')
                .setValue('antiMassMention')
                .setEmoji('👥'),
            new discord_js_1.StringSelectMenuOptionBuilder()
                .setLabel('Bad Word Filter')
                .setDescription('Filter inappropriate words')
                .setValue('badWordFilter')
                .setEmoji('🤬')
        ]));
        const buttons = new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder()
            .setCustomId('setup_automod_apply')
            .setLabel('✅ Apply Settings')
            .setStyle(discord_js_1.ButtonStyle.Success), new discord_js_1.ButtonBuilder()
            .setCustomId('setup_automod_skip')
            .setLabel('Skip Auto-Mod')
            .setStyle(discord_js_1.ButtonStyle.Secondary), new discord_js_1.ButtonBuilder()
            .setCustomId('setup_automod_all')
            .setLabel('Enable All')
            .setStyle(discord_js_1.ButtonStyle.Primary));
        await interaction.update({
            embeds: [embed],
            components: [selectMenu, buttons]
        });
        // Handle auto-mod selection
        this.createAutoModCollector(originalMessage, interaction.guild);
    }
    /**
     * Create collector for auto-mod setup
     */
    createAutoModCollector(message, guild) {
        let selectedFeatures = [];
        const collector = message.createMessageComponentCollector({
            time: 300000 // 5 minutes
        });
        collector.on('collect', async (interaction) => {
            // Check permissions
            if (!interaction.memberPermissions?.has(discord_js_1.PermissionFlagsBits.Administrator)) {
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
    async applyAutoModSettings(interaction, guild, features) {
        try {
            // Import the database service dynamically to avoid circular deps
            const { postgres: db } = await import('../../database/index.js');
            // Build the automod settings object - use correct column names from schema
            const settings = {
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
                    const labels = {
                        antiSpam: '🚫 Anti-Spam',
                        antiInvite: '🔗 Anti-Invite',
                        antiCaps: '🔠 Anti-Caps',
                        antiMassMention: '👥 Anti-Mass Mention',
                        badWordFilter: '🤬 Bad Word Filter'
                    };
                    return `> ${labels[f]}`;
                }).join('\n')
                : '> *No features enabled*';
            const embed = new discord_js_1.EmbedBuilder()
                .setTitle('✅ Auto-Moderation Configured!')
                .setColor(constants_1.COLORS.SUCCESS)
                .setDescription('**Enabled Features:**\n' +
                enabledList + '\n\n' +
                '**Next Steps:**\n' +
                '> Use `/automod` to fine-tune settings\n' +
                '> Use `/filter add [word]` to add custom filters\n' +
                '> Use `/modlog channel [#channel]` to set log channel');
            await interaction.update({
                embeds: [embed],
                components: [
                    new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder()
                        .setCustomId('setup_continue_features')
                        .setLabel('Continue to Features →')
                        .setStyle(discord_js_1.ButtonStyle.Primary), new discord_js_1.ButtonBuilder()
                        .setCustomId('setup_finish')
                        .setLabel('Finish Setup')
                        .setStyle(discord_js_1.ButtonStyle.Secondary))
                ]
            });
            // Handle next step
            this.createFinalStepCollector(interaction.message);
            Logger_1.default.info('SetupWizard', `AutoMod configured for ${guild.name}: ${features.join(', ')}`);
        }
        catch (error) {
            Logger_1.default.error('SetupWizard', 'Failed to apply automod settings:', { error: error instanceof Error ? error.message : String(error) });
            await interaction.update({
                embeds: [
                    new discord_js_1.EmbedBuilder()
                        .setTitle('❌ Setup Error')
                        .setColor(constants_1.COLORS.ERROR)
                        .setDescription('Failed to save settings. Please try again or use `/automod` manually.\n\n' +
                        `Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
                ],
                components: []
            });
        }
    }
    /**
     * Create collector for final step buttons
     */
    createFinalStepCollector(message) {
        const collector = message.createMessageComponentCollector({
            componentType: discord_js_1.ComponentType.Button,
            time: 120000
        });
        collector.on('collect', async (interaction) => {
            if (!interaction.memberPermissions?.has(discord_js_1.PermissionFlagsBits.Administrator)) {
                await interaction.reply({
                    content: '❌ Only server administrators can use the setup wizard.',
                    ephemeral: true
                });
                return;
            }
            if (interaction.customId === 'setup_continue_features') {
                collector.stop();
                await this.showFeaturesOverview(interaction, message);
            }
            else if (interaction.customId === 'setup_finish') {
                collector.stop();
                await this.showSetupComplete(interaction);
            }
        });
    }
    /**
     * Show features overview
     */
    async showFeaturesOverview(interaction, _message) {
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle('🎯 Feature Overview')
            .setColor(constants_1.COLORS.INFO)
            .setDescription('Here\'s what alterGolden can do for your server:')
            .addFields({
            name: '🎬 Media Downloads',
            value: '`/video [url]` - Download from TikTok, YouTube, Twitter, Instagram & more!\nSupports direct links and quality options.',
            inline: false
        }, {
            name: '🎵 Music Player',
            value: '`/music play [song]` - Full music bot with queue, loop, shuffle, lyrics & more!\nPlay from YouTube, Spotify, SoundCloud.',
            inline: false
        }, {
            name: '⚔️ DeathBattle',
            value: '`/deathbattle [@user]` - Epic anime battles!\nChoose skillsets from various anime and fight other users.',
            inline: false
        }, {
            name: '🛡️ Moderation',
            value: '`/kick` `/ban` `/mute` `/warn`\nFull moderation suite with logging.',
            inline: false
        }, {
            name: '📋 Utilities',
            value: '`/avatar` `/serverinfo` `/afk` and more utility commands.',
            inline: false
        })
            .setFooter({ text: 'Use /help for the complete command list!' });
        await interaction.update({
            embeds: [embed],
            components: [
                new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder()
                    .setCustomId('setup_finish')
                    .setLabel('✅ Complete Setup')
                    .setStyle(discord_js_1.ButtonStyle.Success))
            ]
        });
        // Handle finish button
        const collector = interaction.message.createMessageComponentCollector({
            componentType: discord_js_1.ComponentType.Button,
            time: 60000,
            max: 1
        });
        collector.on('collect', async (btnInteraction) => {
            if (btnInteraction.customId === 'setup_finish') {
                await this.showSetupComplete(btnInteraction);
            }
        });
    }
    /**
     * Show setup complete message
     */
    async showSetupComplete(interaction) {
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle('🎉 Setup Complete!')
            .setColor(constants_1.COLORS.SUCCESS)
            .setDescription('**alterGolden is ready to use!**\n\n' +
            '**Quick Commands:**\n' +
            '> `/help` - View all commands\n' +
            '> `/video [url]` - Download a video\n' +
            '> `/music play [song]` - Play music\n' +
            '> `/automod` - Adjust moderation settings\n\n' +
            '**Need Help?**\n' +
            '> Join our support server or use `/report`\n\n' +
            '*Have fun using alterGolden!* 🤖✨')
            .setTimestamp();
        await interaction.update({
            embeds: [embed],
            components: []
        });
        // Delete after 60 seconds
        setTimeout(() => {
            interaction.message.delete().catch(() => { });
        }, 60000);
    }
    /**
     * Show quick help (ephemeral)
     */
    async showQuickHelp(interaction) {
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle('📚 Quick Help')
            .setColor(constants_1.COLORS.INFO)
            .setDescription('**Essential Commands:**\n\n' +
            '🎬 `/video [url]` - Download videos\n' +
            '🎵 `/music play [query]` - Play music\n' +
            '⚔️ `/deathbattle [@user]` - Anime battles\n' +
            '🛡️ `/automod` - Configure moderation\n' +
            '📋 `/help` - Full command list\n\n' +
            '*Click Setup to configure the bot, or Skip to use default settings.*');
        await interaction.reply({
            embeds: [embed],
            ephemeral: true
        });
    }
}
exports.SetupWizardService = SetupWizardService;
// Export singleton
exports.setupWizardService = SetupWizardService.getInstance();
exports.default = exports.setupWizardService;
//# sourceMappingURL=SetupWizardService.js.map