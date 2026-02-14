/**
 * Track Handler — Type Definitions & Constants
 * Extracted from trackHandler.ts for modularity
 * @module handlers/music/trackTypes
 */

import { User } from 'discord.js';

/**
 * Track data structure
 */
export interface Track {
    title: string;
    author?: string;
    url: string;
    thumbnail?: string;
    duration?: number;
    lengthSeconds: number;
    source?: string;
    searchedByLink?: boolean;
    originalQuery?: string;
    requestedBy?: User | { displayName?: string; username?: string; displayAvatarURL?: () => string | null };
    playedAt?: number;
}

/**
 * Loop mode types
 */
export type LoopMode = 'off' | 'track' | 'queue';

/**
 * Source platform types
 */
export type SourcePlatform = 'youtube' | 'soundcloud' | 'spotify' | 'unknown';

/**
 * Now playing embed options
 */
export interface NowPlayingOptions {
    volume?: number;
    isPaused?: boolean;
    loopMode?: LoopMode;
    isShuffled?: boolean;
    queueLength?: number;
    position?: number;
    player?: unknown;
    requester?: User | null;
    nextTrack?: Track | null;
    loopCount?: number;
    voteSkipCount?: number;
    voteSkipRequired?: number;
    listenerCount?: number;
}

/**
 * Control buttons options
 */
export interface ControlButtonsOptions {
    isPaused?: boolean;
    loopMode?: LoopMode;
    isShuffled?: boolean;
    trackUrl?: string | null;
    userId?: string;
    autoPlay?: boolean;
    listenerCount?: number;
}

/**
 * Queue list options
 */
export interface QueueListOptions {
    page?: number;
    perPage?: number;
    loopMode?: LoopMode;
    isShuffled?: boolean;
    volume?: number;
}

/**
 * Info embed type
 */
export type InfoEmbedType = 'info' | 'success' | 'warning' | 'error';

/**
 * Source platform info
 */
export interface SourceInfo {
    emoji: string;
    name: string;
    color: string;
}

/**
 * Loop display info
 */
export interface LoopDisplayInfo {
    emoji: string;
    text: string;
    label: string;
}

/**
 * Enhanced color scheme
 */
export const COLORS = {
    playing: '#1DB954',      // Spotify green
    paused: '#FFA500',       // Warm orange
    stopped: '#DC143C',      // Crimson
    queued: '#9B59B6',       // Amethyst purple
    info: '#5865F2',         // Discord blurple
    error: '#ED4245',        // Discord red
    warning: '#FEE75C',      // Discord yellow
    success: '#57F287',      // Discord green
    lyrics: '#E91E63',       // Pink for lyrics
    favorites: '#FF6B9D',    // Soft pink for favorites
    history: '#3498DB'       // Sky blue for history
} as const;

/**
 * Loop mode display configuration
 */
export const LOOP_DISPLAY: Record<LoopMode, LoopDisplayInfo> = {
    'off': { emoji: '➡️', text: 'Off', label: 'No Repeat' },
    'track': { emoji: '🔂', text: 'Song', label: 'Repeat Song' },
    'queue': { emoji: '🔁', text: 'Queue', label: 'Repeat All' }
};

/**
 * Source platform styling
 */
export const SOURCE_PLATFORM: Record<SourcePlatform, SourceInfo> = {
    youtube: { emoji: '🔴', name: 'YouTube', color: '#FF0000' },
    soundcloud: { emoji: '🟠', name: 'SoundCloud', color: '#FF5500' },
    spotify: { emoji: '🟢', name: 'Spotify', color: '#1DB954' },
    unknown: { emoji: '🎵', name: 'Music', color: COLORS.info }
};

/**
 * Decorative elements for embeds
 */
export const DECORATIONS = {
    line: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    dotLine: '• • • • • • • • • • • • • • • • • • • •',
    sparkle: '✨',
    music: '🎵',
    disc: '💿'
};

/**
 * NOW PLAYING as emoji letters
 */
export const NOW_PLAYING_EMOJI = '🇳 🇴 🇼  🇵 🇱 🇦 🇾 🇮 🇳 🇬';
export const PAUSED_EMOJI = '⏸️ 🇵 🇦 🇺 🇸 🇪 🇩';
