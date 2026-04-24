/**
 * Track Handler — Button & Component Builders
 * Pure functions for creating Discord buttons and select menus for music UI
 * Extracted from trackHandler.ts for modularity
 * @module handlers/music/trackButtons
 */

import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} from 'discord.js';
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

    // Row 2: Volume, queue, autoplay and vote skip controls
    const volumeRow = new ActionRowBuilder<ButtonBuilder>();

    const voteSkipButton = new ButtonBuilder()
        .setCustomId(`music_voteskip:${guildId}`)
        .setEmoji('🗳️')
        .setStyle(ButtonStyle.Secondary);

    if (options.listenerCount && options.listenerCount <= 1) {
        voteSkipButton.setLabel('Vote Skip').setDisabled(true);
    } else {
        voteSkipButton.setLabel('Vote Skip');
    }

    volumeRow.addComponents(
        new ButtonBuilder()
            .setCustomId(`music_volup:${guildId}`)
            .setLabel('+10')
            .setEmoji('🔊')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`music_voldown:${guildId}`)
            .setLabel('-10')
            .setEmoji('🔉')
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
            .setStyle(autoPlay ? ButtonStyle.Success : ButtonStyle.Secondary),
        voteSkipButton
    );
    rows.push(volumeRow);

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
