/**
 * Settings & Status Handler
 * Handles settings configuration and status display
 * @module handlers/music/settingsHandler
 */

import { 
    ChatInputCommandInteraction, 
    EmbedBuilder, 
    ActionRowBuilder, 
    StringSelectMenuBuilder,
    StringSelectMenuInteraction 
} from 'discord.js';
import { trackHandler } from './trackHandler.js';
import musicCache, { GuildMusicSettings } from '../../cache/music/MusicCacheFacade.js';
import { music } from '../../config/index.js';
import { formatTime } from '../../utils/music/index.js';
import { musicFacade as musicService } from '../../services/music/MusicFacade.js';

// Use any for Track type - different but runtime compatible
type Track = any;

const DEFAULT_VOLUME = (music as { defaults?: { defaultVolume?: number } }).defaults?.defaultVolume || 100;
export interface PlayerStatus {
    position: number;
    ping?: number;
}
function createProgressBar(percent: number, length: number = 20): string {
    const filled = Math.round((percent / 100) * length);
    const empty = length - filled;
    return '▓'.repeat(filled) + '░'.repeat(empty);
}

function formatLoopMode(mode: string): string {
    switch (mode) {
        case 'track': return '🔂 Track';
        case 'queue': return '🔁 Queue';
        default: return '➡️ Off';
    }
}

function formatDuration(ms: number): string {
    return formatTime(Math.floor(ms / 1000));
}
export const settingsHandler = {
    async handleSettings(interaction: ChatInputCommandInteraction): Promise<void> {
        const guildId = interaction.guildId!;
        const settings = musicCache.getGuildSettings(guildId) as GuildMusicSettings | null;

        const embed = new EmbedBuilder()
            .setTitle('⚙️ Music Settings')
            .setColor(0x5865F2)
            .addFields(
                { name: '🔊 Default Volume', value: `${settings?.defaultVolume || DEFAULT_VOLUME}%`, inline: true },
                { name: '🎵 Auto-play', value: settings?.autoPlay ? '✅ Enabled' : '❌ Disabled', inline: true },
                { name: '📢 Announce', value: settings?.announceNowPlaying !== false ? '✅ Enabled' : '❌ Disabled', inline: true },
                { name: '🔄 24/7 Mode', value: settings?.twentyFourSeven ? '✅ Enabled' : '❌ Disabled', inline: true }
            )
            .setFooter({ text: 'Use the dropdown below to change settings' });

        const selectMenu = new StringSelectMenuBuilder()
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

        const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

        await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    },

    async handleSelectMenu(interaction: StringSelectMenuInteraction): Promise<void> {
        const parts = interaction.customId.split(':');
        const type = parts[0];
        const guildId = parts[1];

        if (type !== 'music_settings') return;

        const selected = interaction.values[0];
        const settings = (musicCache.getGuildSettings(guildId) || {}) as GuildMusicSettings;

        switch (selected) {
            case 'volume':
                await this.handleVolumeSelect(interaction, guildId, settings);
                break;
            case 'autoplay':
                settings.autoPlay = !settings.autoPlay;
                musicCache.setGuildSettings(guildId, settings);
                await interaction.reply({
                    content: `✅ Auto-play ${settings.autoPlay ? 'enabled' : 'disabled'}`,
                    ephemeral: true
                });
                break;
            case 'announce':
                settings.announceNowPlaying = settings.announceNowPlaying === false;
                musicCache.setGuildSettings(guildId, settings);
                await interaction.reply({
                    content: `✅ Announcements ${settings.announceNowPlaying ? 'enabled' : 'disabled'}`,
                    ephemeral: true
                });
                break;
            case '247':
                settings.twentyFourSeven = !settings.twentyFourSeven;
                musicCache.setGuildSettings(guildId, settings);
                await interaction.reply({
                    content: `✅ 24/7 mode ${settings.twentyFourSeven ? 'enabled' : 'disabled'}`,
                    ephemeral: true
                });
                break;
        }
    },

    async handleVolumeSelect(interaction: StringSelectMenuInteraction, guildId: string, settings: GuildMusicSettings): Promise<void> {
        const volumeSelect = new StringSelectMenuBuilder()
            .setCustomId(`music_volume_set:${guildId}`)
            .setPlaceholder('Select default volume')
            .addOptions([
                { label: '10%', value: '10' },
                { label: '25%', value: '25' },
                { label: '50%', value: '50' },
                { label: '75%', value: '75' },
                { label: '100%', value: '100' }
            ]);

        const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(volumeSelect);
        await interaction.reply({
            content: '🔊 Select default volume:',
            components: [row],
            ephemeral: true
        });
    },

    async handleStatus(interaction: ChatInputCommandInteraction): Promise<void> {
        const guildId = interaction.guildId!;
        const player = musicService.getPlayer(guildId) as PlayerStatus | null;
        const queue = musicCache.getQueue(guildId);
        const currentTrack = musicService.getCurrentTrack(guildId) as Track | null;

        if (!player || !currentTrack) {
            await interaction.reply({
                embeds: [trackHandler.createInfoEmbed('📊 Player Status', 'No active playback', 'info')],
                ephemeral: true
            });
            return;
        }

        const position = player.position || 0;
        const duration = currentTrack.duration || (currentTrack.lengthSeconds * 1000) || 0;
        const progress = duration > 0 ? Math.round((position / duration) * 100) : 0;
        const queueList = musicService.getQueueList(guildId) as Track[];

        const progressBar = createProgressBar(progress, 20);

        const embed = new EmbedBuilder()
            .setTitle('📊 Player Status')
            .setColor(0x5865F2)
            .addFields(
                { name: '🎵 Now Playing', value: currentTrack.title || 'Unknown', inline: false },
                { name: '⏱️ Progress', value: `${progressBar}\n${formatDuration(position)} / ${formatDuration(duration)}`, inline: false },
                { name: '🔊 Volume', value: `${musicService.getVolume(guildId)}%`, inline: true },
                { name: '📋 Queue', value: `${queueList.length} tracks`, inline: true },
                { name: '🔄 Loop', value: formatLoopMode(musicService.getLoopMode(guildId)), inline: true },
                { name: '🔀 Shuffle', value: musicService.isShuffled(guildId) ? 'On' : 'Off', inline: true },
                { name: '⏸️ Paused', value: queue?.isPaused ? 'Yes' : 'No', inline: true }
            )
            .setFooter({ text: `Latency: ${player.ping || 'N/A'}ms` });

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
};

export default settingsHandler;

