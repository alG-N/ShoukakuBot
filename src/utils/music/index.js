/**
 * Music Utilities
 * Consolidated utility functions for music module
 * @module modules/music/utils
 */

// ==========================================
// TIME UTILITIES
// ==========================================

/**
 * Format milliseconds to duration string
 * @param {number} ms - Milliseconds
 * @returns {string} - Formatted duration (e.g., "1h 30m 45s")
 */
function formatDuration(ms) {
    if (!ms || ms <= 0) return '0s';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes % 60 > 0) parts.push(`${minutes % 60}m`);
    if (seconds % 60 > 0 && hours === 0) parts.push(`${seconds % 60}s`);
    return parts.join(' ') || '0s';
}

/**
 * Format milliseconds to time string
 * @param {number} ms - Milliseconds
 * @returns {string} - Formatted time (e.g., "1:30:45" or "30:45")
 */
function formatTime(ms) {
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
 * @param {number} sec - Seconds
 * @returns {string} - Formatted duration
 */
function formatSecondsToTime(sec) {
    sec = Number(sec) || 0;
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    return h > 0
        ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
        : `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Parse duration string to seconds
 * @param {string|number} durationStr - Duration string (e.g., "1:30:45")
 * @returns {number} - Seconds
 */
function parseDuration(durationStr) {
    if (typeof durationStr === 'number') return durationStr;
    if (!durationStr) return 0;

    const parts = durationStr.toString().split(':').map(Number);
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return 0;
}

/**
 * Format time ago
 * @param {number} timestamp - Timestamp
 * @returns {string} - Time ago string
 */
function formatTimeAgo(timestamp) {
    if (!timestamp) return 'Never';
    const diff = Date.now() - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return `${seconds}s ago`;
}

/**
 * Delay execution
 * @param {number} ms - Milliseconds
 * @returns {Promise<void>}
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ==========================================
// FORMATTING UTILITIES
// ==========================================

/**
 * Format view count
 * @param {number} views - View count
 * @returns {string} - Formatted view count
 */
function formatViewCount(views) {
    if (!views) return 'N/A';
    
    if (views >= 1000000000) {
        return (views / 1000000000).toFixed(1) + 'B';
    }
    if (views >= 1000000) {
        return (views / 1000000).toFixed(1) + 'M';
    }
    if (views >= 1000) {
        return (views / 1000).toFixed(1) + 'K';
    }
    return views.toString();
}

/**
 * Format number with locale
 * @param {number} num - Number
 * @returns {string} - Formatted number
 */
function formatNumber(num) {
    if (!num) return '0';
    return num.toLocaleString();
}

/**
 * Truncate text
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} - Truncated text
 */
function truncateText(text, maxLength = 50) {
    if (!text) return 'Unknown';
    return text.length > maxLength ? text.substring(0, maxLength - 3) + '...' : text;
}

/**
 * Format timestamp
 * @param {number} ms - Timestamp in milliseconds
 * @returns {string} - Formatted timestamp
 */
function formatTimestamp(ms) {
    const date = new Date(ms);
    return date.toLocaleString("en-US", { hour12: false });
}

// ==========================================
// VALIDATORS
// ==========================================

const validators = {
    _youtubeRegex: /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/,
    _idRegex: /^\d{17,19}$/,

    isValidUrl(url) {
        if (!url || typeof url !== 'string') return false;
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    },

    isYouTubeUrl(url) {
        if (!url || typeof url !== 'string') return false;
        return this._youtubeRegex.test(url);
    },

    isValidTrack(track) {
        return !!(track && 
               typeof track.url === 'string' && 
               typeof track.title === 'string' && 
               typeof track.lengthSeconds === 'number' &&
               track.track?.encoded);
    },

    isValidQueue(queue) {
        return !!(queue && Array.isArray(queue.tracks));
    },

    isValidDuration(seconds, maxSeconds) {
        return typeof seconds === 'number' && 
               seconds > 0 && 
               seconds <= maxSeconds;
    },

    isInVoiceChannel(member) {
        return !!(member?.voice?.channel);
    },

    isInSameVoiceChannel(member, botChannelId) {
        return member?.voice?.channelId === botChannelId;
    },

    hasVoicePermissions(channel) {
        if (!channel) return false;
        const permissions = channel.permissionsFor(channel.guild.members.me);
        if (!permissions) return false;
        return permissions.has('Connect') && permissions.has('Speak');
    }
};

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
    // Time utilities
    formatDuration,
    formatTime,
    formatSecondsToTime,
    parseDuration,
    formatTimeAgo,
    delay,
    
    // Formatting utilities
    formatViewCount,
    formatNumber,
    truncateText,
    formatTimestamp,
    
    // Validators
    validators,
    isValidUrl: validators.isValidUrl.bind(validators),
    isYouTubeUrl: validators.isYouTubeUrl.bind(validators),
    isValidTrack: validators.isValidTrack.bind(validators),
    isValidQueue: validators.isValidQueue.bind(validators)
};
