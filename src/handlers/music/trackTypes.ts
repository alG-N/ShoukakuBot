/**
 * Track Handler — Type Definitions & Constants
 * Extracted from trackHandler.ts for modularity
 * @module handlers/music/trackTypes
 */

import type { LoopMode } from '../../types/music/playback.js';
import type {
    SourcePlatform,
    SourceInfo,
    LoopDisplayInfo
} from '../../types/music/session.js';

export { type Track, type TrackInfo } from '../../types/music/track.js';
export { type LoopMode, type NowPlayingOptions } from '../../types/music/playback.js';
export { type SourcePlatform, type ControlButtonsOptions, type QueueListOptions, type InfoEmbedType, type SourceInfo, type LoopDisplayInfo } from '../../types/music/session.js';

/**
 * Track data structure
 */

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
    youtube: { emoji: '☁️', name: 'SoundCloud', color: '#FF5500' },
    soundcloud: { emoji: '☁️', name: 'SoundCloud', color: '#FF5500' },
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



