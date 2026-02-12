/**
 * Music Utilities
 * Consolidated utility functions for music module
 * @module utils/music
 */

import type { GuildMember, VoiceBasedChannel } from 'discord.js';
// TYPES
interface TrackInfo {
    url: string;
    title: string;
    lengthSeconds: number;
    track?: {
        encoded: string;
    };
}

interface QueueInfo {
    tracks: unknown[];
}

interface Validators {
    _youtubeRegex: RegExp;
    _idRegex: RegExp;
    isValidUrl: (url: string) => boolean;
    isYouTubeUrl: (url: string) => boolean;
    isValidTrack: (track: unknown) => track is TrackInfo;
    isValidQueue: (queue: unknown) => queue is QueueInfo;
    isValidDuration: (seconds: number, maxSeconds: number) => boolean;
    isInVoiceChannel: (member: GuildMember | null | undefined) => boolean;
    isInSameVoiceChannel: (member: GuildMember | null | undefined, botChannelId: string | null | undefined) => boolean;
    hasVoicePermissions: (channel: VoiceBasedChannel | null | undefined) => boolean;
}
// TIME UTILITIES
/**
 * Format milliseconds to time string
 * @param ms - Milliseconds
 * @returns Formatted time (e.g., "1:30:45" or "30:45")
 */
export function formatTime(ms: number): string {
    if (!ms || ms < 0) return '0:00';
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Format seconds to duration string
 * @param sec - Seconds
 * @returns Formatted duration
 */
export function formatSecondsToTime(sec: number | string): string {
    const numSec = Number(sec) || 0;
    const h = Math.floor(numSec / 3600);
    const m = Math.floor((numSec % 3600) / 60);
    const s = Math.floor(numSec % 60);
    return h > 0
        ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
        : `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Parse duration string to seconds
 * @param durationStr - Duration string (e.g., "1:30:45")
 * @returns Seconds
 */
export function parseDuration(durationStr: string | number): number {
    if (typeof durationStr === 'number') return durationStr;
    if (!durationStr) return 0;

    const parts = durationStr.toString().split(':').map(Number);
    if (parts.length === 2) return (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
    if (parts.length === 3) return (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0);
    return 0;
}



/**
 * Delay execution
 * @param ms - Milliseconds
 */
export function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// VALIDATORS
export const validators: Validators = {
    _youtubeRegex: /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/,
    _idRegex: /^\d{17,19}$/,

    isValidUrl(url: string): boolean {
        if (!url || typeof url !== 'string') return false;
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    },

    isYouTubeUrl(url: string): boolean {
        if (!url || typeof url !== 'string') return false;
        return this._youtubeRegex.test(url);
    },

    isValidTrack(track: unknown): track is TrackInfo {
        if (!track || typeof track !== 'object') return false;
        const t = track as Record<string, unknown>;
        return !!(t && 
               typeof t.url === 'string' && 
               typeof t.title === 'string' && 
               typeof t.lengthSeconds === 'number' &&
               t.track && typeof (t.track as Record<string, unknown>).encoded === 'string');
    },

    isValidQueue(queue: unknown): queue is QueueInfo {
        if (!queue || typeof queue !== 'object') return false;
        const q = queue as Record<string, unknown>;
        return !!(q && Array.isArray(q.tracks));
    },

    isValidDuration(seconds: number, maxSeconds: number): boolean {
        return typeof seconds === 'number' && 
               seconds > 0 && 
               seconds <= maxSeconds;
    },

    isInVoiceChannel(member: GuildMember | null | undefined): boolean {
        return !!(member?.voice?.channel);
    },

    isInSameVoiceChannel(member: GuildMember | null | undefined, botChannelId: string | null | undefined): boolean {
        return member?.voice?.channelId === botChannelId;
    },

    hasVoicePermissions(channel: VoiceBasedChannel | null | undefined): boolean {
        if (!channel) return false;
        const me = channel.guild.members.me;
        if (!me) return false;
        const permissions = channel.permissionsFor(me);
        if (!permissions) return false;
        return permissions.has('Connect') && permissions.has('Speak');
    }
};

// Export bound validators for convenience
export const isValidUrl = validators.isValidUrl.bind(validators);
export const isYouTubeUrl = validators.isYouTubeUrl.bind(validators);
export const isValidTrack = validators.isValidTrack.bind(validators);
export const isValidQueue = validators.isValidQueue.bind(validators);
