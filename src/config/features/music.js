/**
 * Music Feature Configuration
 * Settings for the music player system
 * @module config/features/music
 */

module.exports = {
    // Enable/disable music system
    enabled: true,
    
    // ==========================================
    // TIMEOUTS
    // ==========================================
    timeouts: {
        inactivity: 3 * 60 * 1000,        // 3 minutes - disconnect when idle
        vcCheck: 60 * 1000,                // 1 minute - check voice channel
        skipVote: 15 * 1000,               // 15 seconds - vote timeout
        collector: 7 * 24 * 60 * 60 * 1000, // 7 days - button collector
        confirmation: 20 * 1000,           // 20 seconds - confirmation dialogs
        trackTransition: 2500              // 2.5 seconds - between tracks
    },

    // ==========================================
    // LIMITS
    // ==========================================
    limits: {
        maxTrackDuration: 600,     // 10 minutes max per track
        maxQueueSize: 100,         // Max tracks in queue
        maxPlaylistSize: 50,       // Max playlist tracks to load
        historySize: 100,          // Max history entries
        favoritesSize: 200,        // Max favorites per user
        recentlyPlayedSize: 50     // Max recently played
    },

    // ==========================================
    // VOTING
    // ==========================================
    voting: {
        minVotesRequired: 5,
        votePercentage: 0.5  // 50% of users needed
    },

    // ==========================================
    // VOLUME
    // ==========================================
    volume: {
        default: 80,
        min: 0,
        max: 200,
        step: 10
    },

    // ==========================================
    // UI
    // ==========================================
    ui: {
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
    },

    // ==========================================
    // CACHE
    // ==========================================
    cache: {
        sessionDuration: 60 * 60 * 1000,      // 1 hour
        playlistCacheDuration: 30 * 60 * 1000  // 30 minutes
    },

    // ==========================================
    // EXPORTED CONSTANTS (for backward compatibility)
    // ==========================================
    INACTIVITY_TIMEOUT: 3 * 60 * 1000,        // 3 minutes - disconnect when idle/paused
    VC_CHECK_INTERVAL: 60 * 1000,              // 1 minute - check voice channel
    TRACK_TRANSITION_DELAY: 2500               // 2.5 seconds - between tracks
};
