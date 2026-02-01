/**
 * Music Cache Facade
 * Provides backward-compatible interface to split cache modules
 * 
 * NEW STRUCTURE:
 * - QueueCache: Guild queue management
 * - UserMusicCache: User preferences, favorites, history
 * - VoteCache: Skip/priority voting
 * - GuildMusicCache: Guild settings, recently played, DJ lock
 * 
 * @module modules/music/repository/MusicCacheFacade
 */

const queueCache = require('./QueueCache');
const userMusicCache = require('./UserMusicCache');
const voteCache = require('./VoteCache');
const guildMusicCache = require('./GuildMusicCache');

/**
 * Facade for backward compatibility
 * Delegates to specialized caches
 */
class MusicCacheFacade {
    constructor() {
        // Expose sub-caches for direct access when needed
        this.queueCache = queueCache;
        this.userMusicCache = userMusicCache;
        this.voteCache = voteCache;
        this.guildMusicCache = guildMusicCache;
        
        // Global cleanup interval
        this._cleanupInterval = setInterval(() => this._runGlobalCleanup(), 10 * 60 * 1000);
    }

    // ========== QUEUE MANAGEMENT (delegated to QueueCache) ==========

    getOrCreateQueue(guildId) {
        return queueCache.getOrCreate(guildId);
    }

    getQueue(guildId) {
        return queueCache.get(guildId);
    }

    updateQueue(guildId, updates) {
        return queueCache.update(guildId, updates);
    }

    deleteQueue(guildId) {
        voteCache.cleanupGuild(guildId);
        return queueCache.delete(guildId);
    }

    hasQueue(guildId) {
        return queueCache.has(guildId);
    }

    // ========== TRACK MANAGEMENT ==========

    addTrack(guildId, track) {
        const result = queueCache.addTrack(guildId, track);
        return result.success ? result.position : result.position;
    }

    addTrackToFront(guildId, track) {
        const result = queueCache.addTrackToFront(guildId, track);
        return result.success ? 1 : 0;
    }

    addTracks(guildId, tracks) {
        const result = queueCache.addTracks(guildId, tracks);
        return result.totalLength;
    }

    removeTrack(guildId, index) {
        return queueCache.removeTrack(guildId, index);
    }

    clearTracks(guildId) {
        queueCache.clearTracks(guildId);
    }

    getNextTrack(guildId) {
        return queueCache.getNextTrack(guildId);
    }

    shuffleQueue(guildId) {
        queueCache.shuffle(guildId);
    }

    unshuffleQueue(guildId) {
        queueCache.unshuffle(guildId);
    }

    // ========== PLAYBACK STATE ==========

    setCurrentTrack(guildId, track) {
        queueCache.setCurrentTrack(guildId, track);
        if (track) {
            guildMusicCache.addToRecentlyPlayed(guildId, track);
        }
    }

    getCurrentTrack(guildId) {
        return queueCache.getCurrentTrack(guildId);
    }

    togglePause(guildId) {
        return queueCache.togglePause(guildId);
    }

    setLoopMode(guildId, mode) {
        queueCache.setLoopMode(guildId, mode);
    }

    cycleLoopMode(guildId) {
        return queueCache.cycleLoopMode(guildId);
    }

    getLoopCount(guildId) {
        const queue = queueCache.get(guildId);
        return queue?.loopCount || 0;
    }

    incrementLoopCount(guildId) {
        const queue = queueCache.get(guildId);
        if (!queue) return 0;
        queue.loopCount = (queue.loopCount || 0) + 1;
        return queue.loopCount;
    }

    resetLoopCount(guildId) {
        const queue = queueCache.get(guildId);
        if (queue) queue.loopCount = 0;
    }

    setVolume(guildId, volume) {
        return queueCache.setVolume(guildId, volume);
    }

    // ========== MESSAGES ==========

    setNowPlayingMessage(guildId, message) {
        queueCache.setNowPlayingMessage(guildId, message);
    }

    getNowPlayingMessage(guildId) {
        return queueCache.getNowPlayingMessage(guildId);
    }

    async clearNowPlayingMessage(guildId) {
        await queueCache.clearNowPlayingMessage(guildId);
    }

    // ========== VOTING (delegated to VoteCache) ==========

    startSkipVote(guildId, userId, listenerCount) {
        return voteCache.startSkipVote(guildId, userId, listenerCount);
    }

    addSkipVote(guildId, userId) {
        return voteCache.addSkipVote(guildId, userId);
    }

    endSkipVote(guildId) {
        return voteCache.endSkipVote(guildId);
    }

    getRequiredVotes(listenerCount) {
        return voteCache.getRequiredVotes(listenerCount);
    }

    hasEnoughSkipVotes(guildId) {
        return voteCache.hasEnoughSkipVotes(guildId);
    }

    getVoteSkipStatus(guildId, listenerCount = 0) {
        return voteCache.getVoteSkipStatus(guildId, listenerCount);
    }

    // ========== USER PREFERENCES (delegated to UserMusicCache) ==========

    getDefaultPreferences() {
        return userMusicCache.getDefaultPreferences();
    }

    getPreferences(userId) {
        return userMusicCache.getPreferences(userId);
    }

    setPreferences(userId, preferences) {
        return userMusicCache.setPreferences(userId, preferences);
    }

    resetPreferences(userId) {
        return userMusicCache.resetPreferences(userId);
    }

    // ========== FAVORITES ==========

    getFavorites(userId) {
        return userMusicCache.getFavorites(userId);
    }

    addFavorite(userId, track) {
        return userMusicCache.addFavorite(userId, track);
    }

    removeFavorite(userId, trackUrl) {
        return userMusicCache.removeFavorite(userId, trackUrl);
    }

    isFavorited(userId, trackUrl) {
        return userMusicCache.isFavorited(userId, trackUrl);
    }

    // ========== LISTENING HISTORY ==========

    addToHistory(userId, track) {
        return userMusicCache.addToHistory(userId, track);
    }

    getHistory(userId, limit = 20) {
        return userMusicCache.getHistory(userId, limit);
    }

    clearHistory(userId) {
        userMusicCache.clearHistory(userId);
    }

    // ========== RECENTLY PLAYED (Per Guild) ==========

    addToRecentlyPlayed(guildId, track) {
        return guildMusicCache.addToRecentlyPlayed(guildId, track);
    }

    getRecentlyPlayed(guildId, limit = 10) {
        return guildMusicCache.getRecentlyPlayed(guildId, limit);
    }

    // ========== DJ LOCK ==========

    setDJLock(guildId, enabled, djUserId = null) {
        guildMusicCache.setDJLock(guildId, enabled, djUserId);
    }

    getDJLock(guildId) {
        return guildMusicCache.getDJLock(guildId);
    }

    isDJ(guildId, userId) {
        return guildMusicCache.isDJ(guildId, userId);
    }

    // ========== PLAYLIST CACHE ==========

    cachePlaylist(playlistUrl, playlistData) {
        guildMusicCache.cachePlaylist(playlistUrl, playlistData);
    }

    getCachedPlaylist(playlistUrl) {
        return guildMusicCache.getCachedPlaylist(playlistUrl);
    }

    // ========== GUILD SETTINGS ==========

    getDefaultGuildSettings() {
        return guildMusicCache.getDefaultSettings();
    }

    getGuildSettings(guildId) {
        return guildMusicCache.getSettings(guildId);
    }

    setGuildSettings(guildId, settings) {
        return guildMusicCache.setSettings(guildId, settings);
    }

    resetGuildSettings(guildId) {
        return guildMusicCache.resetSettings(guildId);
    }

    // ========== CLEANUP ==========

    cleanupGuild(guildId) {
        queueCache.delete(guildId);
        voteCache.cleanupGuild(guildId);
        guildMusicCache.cleanupGuild(guildId);
    }

    stopCleanupInterval() {
        if (this._cleanupInterval) {
            clearInterval(this._cleanupInterval);
            this._cleanupInterval = null;
        }
    }

    _runGlobalCleanup() {
        queueCache.cleanup();
        userMusicCache.cleanup();
        voteCache.cleanup();
        guildMusicCache.cleanup();
    }

    // ========== STATISTICS ==========

    getStats() {
        return {
            queue: queueCache.getStats(),
            user: userMusicCache.getStats(),
            vote: voteCache.getStats(),
            guild: guildMusicCache.getStats(),
        };
    }

    // ========== SHUTDOWN ==========

    shutdown() {
        this.stopCleanupInterval();
        queueCache.shutdown();
        userMusicCache.shutdown();
        voteCache.shutdown();
        guildMusicCache.shutdown();
        console.log('[MusicCacheFacade] All caches shutdown');
    }
}

// Export singleton (backward compatible)
module.exports = new MusicCacheFacade();
