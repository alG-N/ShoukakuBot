import type { GuildMember, VoiceBasedChannel } from 'discord.js';
import type { Track } from '../music/track.js';

export interface QueueInfo {
    tracks: unknown[];
}

export interface Validators {
    _youtubeRegex: RegExp;
    _idRegex: RegExp;
    isValidUrl: (url: string) => boolean;
    isYouTubeUrl: (url: string) => boolean;
    isValidTrack: (track: unknown) => track is Track;
    isValidQueue: (queue: unknown) => queue is QueueInfo;
    isValidDuration: (seconds: number, maxSeconds: number) => boolean;
    isInVoiceChannel: (member: GuildMember | null | undefined) => boolean;
    isInSameVoiceChannel: (member: GuildMember | null | undefined, botChannelId: string | null | undefined) => boolean;
    hasVoicePermissions: (channel: VoiceBasedChannel | null | undefined) => boolean;
}
