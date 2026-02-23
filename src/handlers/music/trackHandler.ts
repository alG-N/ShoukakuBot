/**
 * Track Handler — Facade
 * Delegates to trackTypes, trackEmbeds, and trackButtons modules.
 * Maintains backward compatibility: all existing imports work unchanged.
 * 
 * Original file was ~1074 lines. Split into:
 *   - trackTypes.ts  (~150 lines) — interfaces, types, constants
 *   - trackEmbeds.ts (~530 lines) — embed builder functions
 *   - trackButtons.ts (~270 lines) — button/component builder functions
 *   - trackHandler.ts (~100 lines) — this facade
 * 
 * @module handlers/music/trackHandler
 */

import { ActionRowBuilder, ButtonBuilder, StringSelectMenuBuilder, User } from 'discord.js';
import type {
    Track,
    NowPlayingOptions,
    ControlButtonsOptions,
    QueueListOptions,
    InfoEmbedType,
} from './trackTypes.js';

// Import all functions from split modules
import * as embeds from './trackEmbeds.js';
import * as buttons from './trackButtons.js';

// Re-export all types and constants for backward compatibility
export type { Track, LoopMode, SourcePlatform, NowPlayingOptions, ControlButtonsOptions, QueueListOptions, InfoEmbedType } from './trackTypes.js';
export { COLORS, LOOP_DISPLAY } from './trackTypes.js';

/**
 * TrackHandler class — thin delegation layer for backward compatibility.
 * All methods delegate to standalone functions in trackEmbeds.ts / trackButtons.ts.
 */
class TrackHandler {
    // ─── Embeds ─────────────────────────────────────────────
    createNowPlayingEmbed(track: Track, options?: NowPlayingOptions) {
        return embeds.createNowPlayingEmbed(track, options);
    }
    createQueuedEmbed(track: Track, position: number, requester?: User) {
        return embeds.createQueuedEmbed(track, position, requester);
    }
    createPriorityQueuedEmbed(track: Track, requester?: User) {
        return embeds.createPriorityQueuedEmbed(track, requester);
    }
    createPlaylistEmbed(playlistName: string, trackCount: number, requester?: User, firstTrack?: Track) {
        return embeds.createPlaylistEmbed(playlistName, trackCount, requester, firstTrack);
    }
    createQueueListEmbed(tracks: Track[], currentTrack: Track | null, options?: QueueListOptions) {
        return embeds.createQueueListEmbed(tracks, currentTrack, options);
    }
    createSkipVoteEmbed(track: Track | null, currentVotes: number, requiredVotes: number, timeRemaining?: number) {
        return embeds.createSkipVoteEmbed(track, currentVotes, requiredVotes, timeRemaining);
    }
    createLyricsEmbed(track: Track, lyrics: string) {
        return embeds.createLyricsEmbed(track, lyrics);
    }
    createInfoEmbed(title: string, description: string, type?: InfoEmbedType) {
        return embeds.createInfoEmbed(title, description, type);
    }
    createErrorEmbed(message: string) {
        return embeds.createErrorEmbed(message);
    }
    createSongFinishedEmbed(track: Track | null) {
        return embeds.createSongFinishedEmbed(track);
    }
    createQueueFinishedEmbed(lastTrack?: Track | null) {
        return embeds.createQueueFinishedEmbed(lastTrack);
    }
    createDisconnectedEmbed() {
        return embeds.createDisconnectedEmbed();
    }
    createSkippedEmbed(
        track: Track | null,
        skippedBy: User | { displayName?: string; username?: string; tag?: string },
        reason: 'manual' | 'vote' = 'manual'
    ) {
        return embeds.createSkippedEmbed(track, skippedBy, reason);
    }
    createStoppedByUserEmbed(user?: User | { displayName?: string; username?: string }) {
        return embeds.createStoppedByUserEmbed(user);
    }
    createFavoritesEmbed(favorites: Track[], userId: string, page?: number, perPage?: number) {
        return embeds.createFavoritesEmbed(favorites, userId, page, perPage);
    }
    createHistoryEmbed(history: Track[], userId: string, page?: number, perPage?: number) {
        return embeds.createHistoryEmbed(history, userId, page, perPage);
    }
    async createSettingsEmbed(userId: string) {
        return embeds.createSettingsEmbed(userId);
    }
    createLongVideoConfirmEmbed(track: Track, maxDuration: number) {
        return embeds.createLongVideoConfirmEmbed(track, maxDuration);
    }

    // ─── Buttons / Components ───────────────────────────────
    createControlButtons(guildId: string, options?: ControlButtonsOptions) {
        return buttons.createControlButtons(guildId, options);
    }
    createQueuePaginationButtons(guildId: string, currentPage: number, totalPages: number) {
        return buttons.createQueuePaginationButtons(guildId, currentPage, totalPages);
    }
    createSkipVoteButton(guildId: string, currentVotes: number, requiredVotes: number) {
        return buttons.createSkipVoteButton(guildId, currentVotes, requiredVotes);
    }
    createConfirmButtons(guildId: string, action: string) {
        return buttons.createConfirmButtons(guildId, action);
    }
    async createSettingsComponents(userId: string): Promise<ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[]> {
        return buttons.createSettingsComponents(userId);
    }
    disableButtons(rows: ActionRowBuilder<ButtonBuilder>[]) {
        return buttons.disableButtons(rows);
    }
}

// Export singleton instance
export const trackHandler = new TrackHandler();
export default trackHandler;

// Export class for type usage
export { TrackHandler };
