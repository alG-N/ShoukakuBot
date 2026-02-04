"use strict";
/**
 * Settings & Status Handler
 * Handles settings configuration and status display
 * @module handlers/music/settingsHandler
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.settingsHandler = void 0;
const discord_js_1 = require("discord.js");
const trackHandler_js_1 = require("./trackHandler.js");
const MusicCacheFacade_js_1 = __importDefault(require("../../cache/music/MusicCacheFacade.js"));
const index_js_1 = require("../../config/index.js");
const index_js_2 = require("../../utils/music/index.js");
const MusicFacade_js_1 = require("../../services/music/MusicFacade.js");
const DEFAULT_VOLUME = index_js_1.music.defaults?.defaultVolume || 100;
function createProgressBar(percent, length = 20) {
    const filled = Math.round((percent / 100) * length);
    const empty = length - filled;
    return '▓'.repeat(filled) + '░'.repeat(empty);
}
function formatLoopMode(mode) {
    switch (mode) {
        case 'track': return '🔂 Track';
        case 'queue': return '🔁 Queue';
        default: return '➡️ Off';
    }
}
function formatDuration(ms) {
    return (0, index_js_2.formatTime)(Math.floor(ms / 1000));
}
exports.settingsHandler = {
    async handleSettings(interaction) {
        const guildId = interaction.guildId;
        const settings = MusicCacheFacade_js_1.default.getGuildSettings(guildId);
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle('⚙️ Music Settings')
            .setColor(0x5865F2)
            .addFields({ name: '🔊 Default Volume', value: `${settings?.defaultVolume || DEFAULT_VOLUME}%`, inline: true }, { name: '🎵 Auto-play', value: settings?.autoPlay ? '✅ Enabled' : '❌ Disabled', inline: true }, { name: '📢 Announce', value: settings?.announceNowPlaying !== false ? '✅ Enabled' : '❌ Disabled', inline: true }, { name: '🔄 24/7 Mode', value: settings?.twentyFourSeven ? '✅ Enabled' : '❌ Disabled', inline: true })
            .setFooter({ text: 'Use the dropdown below to change settings' });
        const selectMenu = new discord_js_1.StringSelectMenuBuilder()
            .setCustomId(`music_settings:${guildId}`)
            .setPlaceholder('Select a setting to change')
            .addOptions([
            {
                label: 'Default Volume',
                description: 'Set default volume for playback',
                value: 'volume',
                emoji: '🔊'
            },
            {
                label: 'Toggle Auto-play',
                description: 'Auto-play similar tracks when queue ends',
                value: 'autoplay',
                emoji: '🎵'
            },
            {
                label: 'Toggle Announcements',
                description: 'Announce now playing in chat',
                value: 'announce',
                emoji: '📢'
            },
            {
                label: 'Toggle 24/7 Mode',
                description: 'Stay in voice channel even when empty',
                value: '247',
                emoji: '🔄'
            }
        ]);
        const row = new discord_js_1.ActionRowBuilder().addComponents(selectMenu);
        await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    },
    async handleSelectMenu(interaction) {
        const parts = interaction.customId.split(':');
        const type = parts[0];
        const guildId = parts[1];
        if (type !== 'music_settings')
            return;
        const selected = interaction.values[0];
        const settings = (MusicCacheFacade_js_1.default.getGuildSettings(guildId) || {});
        switch (selected) {
            case 'volume':
                await this.handleVolumeSelect(interaction, guildId, settings);
                break;
            case 'autoplay':
                settings.autoPlay = !settings.autoPlay;
                MusicCacheFacade_js_1.default.setGuildSettings(guildId, settings);
                await interaction.reply({
                    content: `✅ Auto-play ${settings.autoPlay ? 'enabled' : 'disabled'}`,
                    ephemeral: true
                });
                break;
            case 'announce':
                settings.announceNowPlaying = settings.announceNowPlaying === false;
                MusicCacheFacade_js_1.default.setGuildSettings(guildId, settings);
                await interaction.reply({
                    content: `✅ Announcements ${settings.announceNowPlaying ? 'enabled' : 'disabled'}`,
                    ephemeral: true
                });
                break;
            case '247':
                settings.twentyFourSeven = !settings.twentyFourSeven;
                MusicCacheFacade_js_1.default.setGuildSettings(guildId, settings);
                await interaction.reply({
                    content: `✅ 24/7 mode ${settings.twentyFourSeven ? 'enabled' : 'disabled'}`,
                    ephemeral: true
                });
                break;
        }
    },
    async handleVolumeSelect(interaction, guildId, settings) {
        const volumeSelect = new discord_js_1.StringSelectMenuBuilder()
            .setCustomId(`music_volume_set:${guildId}`)
            .setPlaceholder('Select default volume')
            .addOptions([
            { label: '10%', value: '10' },
            { label: '25%', value: '25' },
            { label: '50%', value: '50' },
            { label: '75%', value: '75' },
            { label: '100%', value: '100' }
        ]);
        const row = new discord_js_1.ActionRowBuilder().addComponents(volumeSelect);
        await interaction.reply({
            content: '🔊 Select default volume:',
            components: [row],
            ephemeral: true
        });
    },
    async handleStatus(interaction) {
        const guildId = interaction.guildId;
        const player = MusicFacade_js_1.musicFacade.getPlayer(guildId);
        const queue = MusicCacheFacade_js_1.default.getQueue(guildId);
        const currentTrack = MusicFacade_js_1.musicFacade.getCurrentTrack(guildId);
        if (!player || !currentTrack) {
            await interaction.reply({
                embeds: [trackHandler_js_1.trackHandler.createInfoEmbed('📊 Player Status', 'No active playback', 'info')],
                ephemeral: true
            });
            return;
        }
        const position = player.position || 0;
        const duration = currentTrack.duration || (currentTrack.lengthSeconds * 1000) || 0;
        const progress = duration > 0 ? Math.round((position / duration) * 100) : 0;
        const queueList = MusicFacade_js_1.musicFacade.getQueueList(guildId);
        const progressBar = createProgressBar(progress, 20);
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle('📊 Player Status')
            .setColor(0x5865F2)
            .addFields({ name: '🎵 Now Playing', value: currentTrack.title || 'Unknown', inline: false }, { name: '⏱️ Progress', value: `${progressBar}\n${formatDuration(position)} / ${formatDuration(duration)}`, inline: false }, { name: '🔊 Volume', value: `${MusicFacade_js_1.musicFacade.getVolume(guildId)}%`, inline: true }, { name: '📋 Queue', value: `${queueList.length} tracks`, inline: true }, { name: '🔄 Loop', value: formatLoopMode(MusicFacade_js_1.musicFacade.getLoopMode(guildId)), inline: true }, { name: '🔀 Shuffle', value: MusicFacade_js_1.musicFacade.isShuffled(guildId) ? 'On' : 'Off', inline: true }, { name: '⏸️ Paused', value: queue?.isPaused ? 'Yes' : 'No', inline: true })
            .setFooter({ text: `Latency: ${player.ping || 'N/A'}ms` });
        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
};
exports.default = exports.settingsHandler;
//# sourceMappingURL=settingsHandler.js.map