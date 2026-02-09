/**
 * Music Feature Configuration
 * @module config/features/music
 */

export const enabled = true;

export const timeouts = {
    inactivity: 3 * 60 * 1000,        // 3 minutes
    vcCheck: 60 * 1000,                // 1 minute
    skipVote: 15 * 1000,               // 15 seconds
    collector: 7 * 24 * 60 * 60 * 1000, // 7 days
    confirmation: 20 * 1000,           // 20 seconds
    trackTransition: 2500              // 2.5 seconds
};

export const limits = {
    maxTrackDuration: 600,     // 10 minutes
    maxQueueSize: 100,
    maxPlaylistSize: 50,
    historySize: 100,
    favoritesSize: 200,
    recentlyPlayedSize: 50
};

export const voting = {
    minVotesRequired: 2,
    votePercentage: 0.5
};

export const volume = {
    default: 80,
    min: 0,
    max: 200,
    step: 10
};

export const ui = {
    tracksPerPage: 10,
    logChannelId: '1411386693499486429',
    
    colors: {
        playing: '#00FF00',
        paused: '#FFD700',
        stopped: '#FF0000',
        queued: '#9400D3',
        info: '#3498DB',
        error: '#E74C3C',
        warning: '#F39C12',
        success: '#2ECC71'
    },
    
    emojis: {
        loop: {
            off: '➡️',
            track: '🔂',
            queue: '🔁'
        },
        source: {
            youtube: '🎵',
            soundcloud: '☁️',
            spotify: '💚',
            unknown: '🎶'
        }
    }
};

export const cache = {
    sessionDuration: 60 * 60 * 1000,
    playlistCacheDuration: 30 * 60 * 1000
};

// Legacy constants
export const INACTIVITY_TIMEOUT = 3 * 60 * 1000;
export const VC_CHECK_INTERVAL = 60 * 1000;
export const TRACK_TRANSITION_DELAY = 2500;

export default {
    enabled,
    timeouts,
    limits,
    voting,
    volume,
    ui,
    cache,
    INACTIVITY_TIMEOUT,
    VC_CHECK_INTERVAL,
    TRACK_TRANSITION_DELAY
};
