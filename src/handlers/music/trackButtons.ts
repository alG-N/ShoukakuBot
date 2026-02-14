/**
 * Track Handler — Button & Component Builders
 * Pure functions for creating Discord buttons and select menus for music UI
 * Extracted from trackHandler.ts for modularity
 * @module handlers/music/trackButtons
 */

import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder
} from 'discord.js';
import musicCache from '../../cache/music/MusicCacheFacade.js';
import { type ControlButtonsOptions, LOOP_DISPLAY } from './trackTypes.js';

/**
 * Create control buttons — Clean with labels
 */
export function createControlButtons(guildId: string, options: ControlButtonsOptions = {}): ActionRowBuilder<ButtonBuilder>[] {
    const {
        isPaused = false,
        loopMode = 'off',
        isShuffled = false,
        trackUrl = null,
        autoPlay = false
    } = options;

    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    const loopInfo = LOOP_DISPLAY[loopMode];

    // Row 1: Main playback controls
    const controlRow = new ActionRowBuilder<ButtonBuilder>();
    controlRow.addComponents(
        new ButtonBuilder()
            .setCustomId(`music_pause:${guildId}`)
            .setLabel(isPaused ? 'Resume' : 'Pause')
            .setEmoji(isPaused ? '▶️' : '⏸️')
            .setStyle(isPaused ? ButtonStyle.Success : ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(`music_stop:${guildId}`)
            .setLabel('Stop')
            .setEmoji('⏹️')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId(`music_skip:${guildId}`)
            .setLabel('Skip')
            .setEmoji('⏭️')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`music_loop:${guildId}`)
            .setLabel(loopInfo.text)
            .setEmoji(loopInfo.emoji)
            .setStyle(loopMode !== 'off' ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setDisabled(autoPlay),
        new ButtonBuilder()
            .setCustomId(`music_shuffle:${guildId}`)
            .setLabel('Shuffle')
            .setEmoji('🔀')
            .setStyle(isShuffled ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setDisabled(autoPlay)
    );
    rows.push(controlRow);

    // Row 2: Volume, queue and autoplay controls
    const volumeRow = new ActionRowBuilder<ButtonBuilder>();
    volumeRow.addComponents(
        new ButtonBuilder()
            .setCustomId(`music_voldown:${guildId}`)
            .setLabel('-10')
            .setEmoji('🔉')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`music_volup:${guildId}`)
            .setLabel('+10')
            .setEmoji('🔊')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`music_queue:${guildId}`)
            .setLabel('Queue')
            .setEmoji('📋')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(`music_autoplay:${guildId}`)
            .setLabel('Autoplay')
            .setEmoji('🎵')
            .setStyle(autoPlay ? ButtonStyle.Success : ButtonStyle.Secondary)
    );
    rows.push(volumeRow);

    // Row 3: Extra features
    if (trackUrl) {
        const extraRow = new ActionRowBuilder<ButtonBuilder>();
        extraRow.addComponents(
            new ButtonBuilder()
                .setLabel('Open Link')
                .setStyle(ButtonStyle.Link)
                .setURL(trackUrl)
                .setEmoji('🔗'),
            new ButtonBuilder()
                .setCustomId(`music_lyrics:${guildId}`)
                .setLabel('Lyrics')
                .setEmoji('📝')
                .setStyle(ButtonStyle.Primary)
        );

        const voteSkipButton = new ButtonBuilder()
            .setCustomId(`music_voteskip:${guildId}`)
            .setEmoji('🗳️')
            .setStyle(ButtonStyle.Secondary);

        if (options.listenerCount && options.listenerCount <= 1) {
            voteSkipButton.setLabel('Vote Skip').setDisabled(true);
        } else {
            voteSkipButton.setLabel('Vote Skip');
        }
        extraRow.addComponents(voteSkipButton);

        rows.push(extraRow);
    }

    return rows;
}

/**
 * Create queue pagination buttons
 */
export function createQueuePaginationButtons(guildId: string, currentPage: number, totalPages: number): ActionRowBuilder<ButtonBuilder> {
    const row = new ActionRowBuilder<ButtonBuilder>();

    row.addComponents(
        new ButtonBuilder()
            .setCustomId(`music_qpage:${guildId}:first`)
            .setLabel('First')
            .setEmoji('⏮️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentPage <= 1),
        new ButtonBuilder()
            .setCustomId(`music_qpage:${guildId}:prev`)
            .setLabel('Prev')
            .setEmoji('◀️')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(currentPage <= 1),
        new ButtonBuilder()
            .setCustomId(`music_qpage:${guildId}:info`)
            .setLabel(`${currentPage} / ${totalPages}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId(`music_qpage:${guildId}:next`)
            .setLabel('Next')
            .setEmoji('▶️')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(currentPage >= totalPages),
        new ButtonBuilder()
            .setCustomId(`music_qpage:${guildId}:last`)
            .setLabel('Last')
            .setEmoji('⏭️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentPage >= totalPages)
    );

    return row;
}

/**
 * Create skip vote button
 */
export function createSkipVoteButton(guildId: string, currentVotes: number, requiredVotes: number): ActionRowBuilder<ButtonBuilder> {
    const row = new ActionRowBuilder<ButtonBuilder>();

    row.addComponents(
        new ButtonBuilder()
            .setCustomId(`music_voteskip_add:${guildId}`)
            .setLabel(`Vote to Skip (${currentVotes}/${requiredVotes})`)
            .setEmoji('🗳️')
            .setStyle(ButtonStyle.Primary)
    );

    return row;
}

/**
 * Create confirmation buttons
 */
export function createConfirmButtons(guildId: string, action: string): ActionRowBuilder<ButtonBuilder> {
    const row = new ActionRowBuilder<ButtonBuilder>();

    row.addComponents(
        new ButtonBuilder()
            .setCustomId(`music_confirm:${guildId}:${action}:yes`)
            .setLabel('Yes, Add It')
            .setEmoji('✅')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`music_confirm:${guildId}:${action}:no`)
            .setLabel('Cancel')
            .setEmoji('❌')
            .setStyle(ButtonStyle.Danger)
    );

    return row;
}

/**
 * Create settings select menus
 */
export async function createSettingsComponents(userId: string): Promise<ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[]> {
    const prefs = await musicCache.getPreferences(userId);
    const rows: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [];

    // Volume select
    const volumeSelect = new StringSelectMenuBuilder()
        .setCustomId(`music_setting_volume:${userId}`)
        .setPlaceholder('🔊 Select Default Volume')
        .addOptions([
            { label: '🔈 25% - Quiet', value: '25', description: 'Low volume', default: prefs.defaultVolume === 25 },
            { label: '🔉 50% - Medium', value: '50', description: 'Medium volume', default: prefs.defaultVolume === 50 },
            { label: '🔉 75% - Moderate', value: '75', description: 'Moderate volume', default: prefs.defaultVolume === 75 },
            { label: '🔊 100% - Normal', value: '100', description: 'Default volume', default: prefs.defaultVolume === 100 },
            { label: '🔊 125% - Loud', value: '125', description: 'Above normal', default: prefs.defaultVolume === 125 },
            { label: '📢 150% - Very Loud', value: '150', description: 'High volume', default: prefs.defaultVolume === 150 }
        ]);
    rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(volumeSelect));

    // Max duration select
    const durationSelect = new StringSelectMenuBuilder()
        .setCustomId(`music_setting_duration:${userId}`)
        .setPlaceholder('⏱️ Max Track Duration')
        .addOptions([
            { label: '5 minutes', value: '300', emoji: '⏱️', description: 'Short tracks only', default: prefs.maxTrackDuration === 300 },
            { label: '10 minutes', value: '600', emoji: '⏱️', description: 'Standard limit', default: prefs.maxTrackDuration === 600 },
            { label: '15 minutes', value: '900', emoji: '⏱️', description: 'Extended tracks', default: prefs.maxTrackDuration === 900 },
            { label: '30 minutes', value: '1800', emoji: '⏱️', description: 'Long tracks', default: prefs.maxTrackDuration === 1800 },
            { label: '1 hour', value: '3600', emoji: '⏱️', description: 'Very long tracks', default: prefs.maxTrackDuration === 3600 },
            { label: '♾️ Unlimited', value: '99999', emoji: '♾️', description: 'No limit', default: prefs.maxTrackDuration >= 99999 }
        ]);
    rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(durationSelect));

    // Toggles row
    const toggleRow = new ActionRowBuilder<ButtonBuilder>();
    toggleRow.addComponents(
        new ButtonBuilder()
            .setCustomId(`music_setting_announce:${userId}`)
            .setLabel(prefs.announceTrack ? 'Announce: ON' : 'Announce: OFF')
            .setEmoji('📢')
            .setStyle(prefs.announceTrack ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`music_setting_voteskip:${userId}`)
            .setLabel(prefs.voteSkipEnabled ? 'Vote Skip: ON' : 'Vote Skip: OFF')
            .setEmoji('🗳️')
            .setStyle(prefs.voteSkipEnabled ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`music_setting_thumbnails:${userId}`)
            .setLabel(prefs.showThumbnails ? 'Thumbnails: ON' : 'Thumbnails: OFF')
            .setEmoji('🖼️')
            .setStyle(prefs.showThumbnails ? ButtonStyle.Success : ButtonStyle.Secondary)
    );
    rows.push(toggleRow);

    return rows;
}

/**
 * Disable all buttons in rows
 */
export function disableButtons(rows: ActionRowBuilder<ButtonBuilder>[]): ActionRowBuilder<ButtonBuilder>[] {
    return rows.map(row => {
        const newRow = ActionRowBuilder.from<ButtonBuilder>(row);
        newRow.components.forEach(component => {
            if (component.data.style !== ButtonStyle.Link) {
                component.setDisabled(true);
            }
        });
        return newRow;
    });
}
