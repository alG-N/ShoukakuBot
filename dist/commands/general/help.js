"use strict";
/**
 * Help Command - Presentation Layer
 * Shows list of available commands with button navigation
 * @module commands/general/help
 */
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const BaseCommand_1 = require("../BaseCommand");
const constants_1 = require("../../constants");
/**
 * Category configuration
 */
const CATEGORIES = {
    home: { emoji: '🏠', name: 'Home', description: 'Overview' },
    media: { emoji: '🎬', name: 'Media', description: 'Video & Image commands' },
    music: { emoji: '🎵', name: 'Music', description: 'Music playback' },
    fun: { emoji: '⚔️', name: 'Fun', description: 'Interactive games' },
    utility: { emoji: '📋', name: 'Utility', description: 'Useful tools' },
    admin: { emoji: '🛡️', name: 'Admin', description: 'Server management' },
    moderation: { emoji: '⚙️', name: 'Moderation', description: 'Auto-mod & filters' }
};
class HelpCommand extends BaseCommand_1.BaseCommand {
    constructor() {
        super({
            category: BaseCommand_1.CommandCategory.GENERAL,
            cooldown: 5,
            deferReply: false
        });
    }
    get data() {
        return new discord_js_1.SlashCommandBuilder()
            .setName('help')
            .setDescription('Shows a list of all available commands');
    }
    /**
     * Build embed for a specific category
     */
    buildCategoryEmbed(category, user) {
        const embed = new discord_js_1.EmbedBuilder()
            .setColor(constants_1.COLORS.INFO)
            .setTimestamp()
            .setFooter({
            text: `Requested by ${user.tag} • Use buttons to navigate`,
            iconURL: user.displayAvatarURL()
        });
        switch (category) {
            case 'home':
                embed
                    .setTitle('📚 alterGolden - Help Menu')
                    .setDescription('**Welcome to alterGolden!** 🎉\n\n' +
                    'Use the buttons below to browse commands by category.\n\n' +
                    '**Quick Start:**\n' +
                    '> 🎬 `/video` - Download videos from social media\n' +
                    '> 🎵 `/music play` - Play music in voice channel\n' +
                    '> ⚔️ `/deathbattle` - Battle with anime skillsets\n' +
                    '> 🛡️ `/automod` - Configure auto-moderation\n\n' +
                    '**Categories:**')
                    .addFields({ name: '🎬 Media', value: 'Video downloads, Reddit, Pixiv', inline: true }, { name: '🎵 Music', value: 'Play, queue, controls', inline: true }, { name: '⚔️ Fun', value: 'Games & interactions', inline: true }, { name: '📋 Utility', value: 'Avatar, info, AFK', inline: true }, { name: '🛡️ Admin', value: 'Kick, ban, mute', inline: true }, { name: '⚙️ Moderation', value: 'AutoMod, filters', inline: true });
                break;
            case 'media':
                embed
                    .setTitle('🎬 Media Commands')
                    .setDescription('Download videos and browse content from various platforms.')
                    .addFields({
                    name: '📥 Video Download',
                    value: [
                        '`/video [url]` - Download from TikTok, YouTube, Twitter, etc.',
                        '`/video [url] mode:link` - Get direct download link',
                        '`/video [url] quality:480` - Lower quality, smaller file'
                    ].join('\n'),
                    inline: false
                }, {
                    name: '🎨 Image & Content',
                    value: [
                        '`/pixiv [query]` - Search Pixiv artwork',
                        '`/reddit [subreddit]` - Fetch posts from Reddit',
                        '`/rule34 search [tag]` - Search R34 images'
                    ].join('\n'),
                    inline: false
                }, {
                    name: '📺 Info',
                    value: [
                        '`/anime [name]` - Search anime information',
                        '`/steam` - Check Steam sales'
                    ].join('\n'),
                    inline: false
                });
                break;
            case 'music':
                embed
                    .setTitle('🎵 Music Commands')
                    .setDescription('Play music in voice channels with full queue control.')
                    .addFields({
                    name: '▶️ Playback',
                    value: [
                        '`/music play [query/url]` - Play a song or playlist',
                        '`/music pause` - Pause/resume playback',
                        '`/music skip` - Skip current track',
                        '`/music stop` - Stop and disconnect'
                    ].join('\n'),
                    inline: false
                }, {
                    name: '📋 Queue',
                    value: [
                        '`/music queue` - View the current queue',
                        '`/music nowplaying` - Show current track',
                        '`/music shuffle` - Shuffle the queue',
                        '`/music remove [position]` - Remove a track'
                    ].join('\n'),
                    inline: false
                }, {
                    name: '🎛️ Controls',
                    value: [
                        '`/music volume [0-100]` - Adjust volume',
                        '`/music loop [off/track/queue]` - Toggle loop mode',
                        '`/music seek [time]` - Seek to position',
                        '`/music lyrics` - Get song lyrics'
                    ].join('\n'),
                    inline: false
                });
                break;
            case 'fun':
                embed
                    .setTitle('⚔️ Fun & Interactive')
                    .setDescription('Games and fun interactions with other users.')
                    .addFields({
                    name: '🎮 Games',
                    value: [
                        '`/deathbattle [@user] [skillset]` - Anime battle!',
                        '> Choose from various anime skillsets',
                        '> Battle other users or AI',
                        '> Earn victories and stats'
                    ].join('\n'),
                    inline: false
                }, {
                    name: '💬 Interactions',
                    value: [
                        '`/say [message]` - Make the bot speak',
                        '`/8ball [question]` - Ask the magic 8-ball'
                    ].join('\n'),
                    inline: false
                });
                break;
            case 'utility':
                embed
                    .setTitle('📋 Utility Commands')
                    .setDescription('Useful tools and information commands.')
                    .addFields({
                    name: '👤 User Info',
                    value: [
                        '`/avatar [user]` - View user avatar (full size)',
                        '`/userinfo [@user]` - Detailed user information',
                        '`/afk [reason]` - Set AFK status'
                    ].join('\n'),
                    inline: false
                }, {
                    name: '🏠 Server Info',
                    value: [
                        '`/serverinfo` - Server information & stats',
                        '`/roleinfo [@role]` - Role information',
                        '`/invite` - Get bot invite link'
                    ].join('\n'),
                    inline: false
                }, {
                    name: '🔧 Tools',
                    value: [
                        '`/ping` - Check bot latency',
                        '`/report` - Report an issue'
                    ].join('\n'),
                    inline: false
                });
                break;
            case 'admin':
                embed
                    .setTitle('🛡️ Admin Commands')
                    .setDescription('Server management and moderation. Requires permissions.')
                    .addFields({
                    name: '👢 Punishments',
                    value: [
                        '`/kick [@user] [reason]` - Kick a user',
                        '`/ban [@user] [reason]` - Ban a user',
                        '`/mute [@user] [duration]` - Timeout a user',
                        '`/warn [@user] [reason]` - Warn a user'
                    ].join('\n'),
                    inline: false
                }, {
                    name: '🗑️ Messages',
                    value: [
                        '`/delete [amount]` - Bulk delete messages',
                        '`/snipe` - View last deleted message'
                    ].join('\n'),
                    inline: false
                }, {
                    name: '⚙️ Settings',
                    value: [
                        '`/setting` - Configure server settings',
                        '`/setup` - Setup wizard for new servers'
                    ].join('\n'),
                    inline: false
                });
                break;
            case 'moderation':
                embed
                    .setTitle('⚙️ Auto-Moderation')
                    .setDescription('Automatic moderation to keep your server safe.')
                    .addFields({
                    name: '🤖 AutoMod',
                    value: [
                        '`/automod` - Configure auto-moderation',
                        '> Anti-spam protection',
                        '> Anti-invite links',
                        '> Bad word filters',
                        '> Caps lock detection',
                        '> Mass mention protection'
                    ].join('\n'),
                    inline: false
                }, {
                    name: '🚫 Filters',
                    value: [
                        '`/filter add [word]` - Add word to filter',
                        '`/filter remove [word]` - Remove from filter',
                        '`/filter list` - View filtered words'
                    ].join('\n'),
                    inline: false
                }, {
                    name: '📝 Logs',
                    value: [
                        '`/modlog channel [#channel]` - Set mod log channel',
                        '`/modlog view [@user]` - View user infractions'
                    ].join('\n'),
                    inline: false
                });
                break;
        }
        return embed;
    }
    /**
     * Build navigation buttons
     */
    buildButtons(currentCategory) {
        const row1 = new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder()
            .setCustomId('help_home')
            .setEmoji('🏠')
            .setStyle(currentCategory === 'home' ? discord_js_1.ButtonStyle.Primary : discord_js_1.ButtonStyle.Secondary)
            .setDisabled(currentCategory === 'home'), new discord_js_1.ButtonBuilder()
            .setCustomId('help_media')
            .setEmoji('🎬')
            .setLabel('Media')
            .setStyle(currentCategory === 'media' ? discord_js_1.ButtonStyle.Primary : discord_js_1.ButtonStyle.Secondary), new discord_js_1.ButtonBuilder()
            .setCustomId('help_music')
            .setEmoji('🎵')
            .setLabel('Music')
            .setStyle(currentCategory === 'music' ? discord_js_1.ButtonStyle.Primary : discord_js_1.ButtonStyle.Secondary), new discord_js_1.ButtonBuilder()
            .setCustomId('help_fun')
            .setEmoji('⚔️')
            .setLabel('Fun')
            .setStyle(currentCategory === 'fun' ? discord_js_1.ButtonStyle.Primary : discord_js_1.ButtonStyle.Secondary));
        const row2 = new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder()
            .setCustomId('help_utility')
            .setEmoji('📋')
            .setLabel('Utility')
            .setStyle(currentCategory === 'utility' ? discord_js_1.ButtonStyle.Primary : discord_js_1.ButtonStyle.Secondary), new discord_js_1.ButtonBuilder()
            .setCustomId('help_admin')
            .setEmoji('🛡️')
            .setLabel('Admin')
            .setStyle(currentCategory === 'admin' ? discord_js_1.ButtonStyle.Primary : discord_js_1.ButtonStyle.Secondary), new discord_js_1.ButtonBuilder()
            .setCustomId('help_moderation')
            .setEmoji('⚙️')
            .setLabel('Moderation')
            .setStyle(currentCategory === 'moderation' ? discord_js_1.ButtonStyle.Primary : discord_js_1.ButtonStyle.Secondary));
        return [row1, row2];
    }
    async run(interaction) {
        let currentCategory = 'home';
        const embed = this.buildCategoryEmbed(currentCategory, interaction.user);
        const buttons = this.buildButtons(currentCategory);
        const response = await interaction.reply({
            embeds: [embed],
            components: buttons,
            fetchReply: true
        });
        // Create collector for button interactions
        const collector = response.createMessageComponentCollector({
            componentType: discord_js_1.ComponentType.Button,
            filter: (i) => i.user.id === interaction.user.id,
            time: 300000 // 5 minutes
        });
        collector.on('collect', async (buttonInteraction) => {
            // Extract category from button ID
            const newCategory = buttonInteraction.customId.replace('help_', '');
            currentCategory = newCategory;
            const newEmbed = this.buildCategoryEmbed(currentCategory, interaction.user);
            const newButtons = this.buildButtons(currentCategory);
            await buttonInteraction.update({
                embeds: [newEmbed],
                components: newButtons
            });
        });
        collector.on('end', async () => {
            // Disable all buttons when collector ends
            const disabledButtons = this.buildButtons(currentCategory).map(row => {
                row.components.forEach(button => button.setDisabled(true));
                return row;
            });
            await interaction.editReply({ components: disabledButtons }).catch(() => { });
        });
    }
}
// Export singleton instance
const helpCommand = new HelpCommand();
exports.default = helpCommand;
// CommonJS compatibility
module.exports = helpCommand;
//# sourceMappingURL=help.js.map