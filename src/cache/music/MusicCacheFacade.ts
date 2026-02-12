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

import queueCache, { MusicTrack, MusicQueue, type MessageRef } from './QueueCache.js';
import userMusicCache, { UserPreferences, FavoriteTrack, HistoryTrack, AddFavoriteResult, UserMusicStats } from './UserMusicCache.js';
import voteCache, { VoteResult, AddVoteResult, VoteSkipStatus } from './VoteCache.js';
import guildMusicCache, { GuildMusicSettings, RecentlyPlayedTrack, DJLockState, CachedPlaylist } from './GuildMusicCache.js';
import logger from '../../core/Logger.js';
// Types
export interface MusicCacheStats {
    queue: ReturnType<typeof queueCache.getStats>;
    user: UserMusicStats;
    vote: ReturnType<typeof voteCache.getStats>;
    guild: ReturnType<typeof guildMusicCache.getStats>;
}

// Re-export types for convenience
export type {
    MusicTrack,
    MusicQueue,
    UserPreferences,
    FavoriteTrack,
    HistoryTrack,
    GuildMusicSettings,
    RecentlyPlayedTrack,
    DJLockState,
    VoteResult,
    AddVoteResult,
    VoteSkipStatus
};
// MusicCacheFacade Class
/**
 * Facade for backward compatibility
 * Delegates to specialized caches
 */
class MusicCacheFacade {
    // Expose sub-caches for direct access when needed
    public readonly queueCache = queueCache;
    public readonly userMusicCache = userMusicCache;
    public readonly voteCache = voteCache;
    public readonly guildMusicCache = guildMusicCache;
    
    // Global cleanup interval
    private _cleanupInterval: NodeJS.Timeout;

    constructor() {
        this._cleanupInterval = setInterval(() => this._runGlobalCleanup(), 10 * 60 * 1000);
    }
    getOrCreateQueue(guildId: string): MusicQueue {
        return queueCache.getOrCreate(guildId);
    }

    getQueue(guildId: string): MusicQueue | null {
        return queueCache.get(guildId);
    }

    updateQueue(guildId: string, updates: Partial<MusicQueue>): MusicQueue | null {
        return queueCache.update(guildId, updates);
    }

    deleteQueue(guildId: string): boolean {
        voteCache.cleanupGuild(guildId);
        return queueCache.delete(guildId);
    }

    hasQueue(guildId: string): boolean {
        return queueCache.has(guildId);
    }
    addTrack(guildId: string, track: MusicTrack): number {
        const result = queueCache.addTrack(guildId, track);
        return result.position;
    }

    addTrackToFront(guildId: string, track: MusicTrack): number {
        const result = queueCache.addTrackToFront(guildId, track);
        return result.success ? 1 : 0;
    }

    addTracks(guildId: string, tracks: MusicTrack[]): number {
        const result = queueCache.addTracks(guildId, tracks);
        return result.totalLength;
    }

    removeTrack(guildId: string, index: number): MusicTrack | null {
        return queueCache.removeTrack(guildId, index);
    }

    clearTracks(guildId: string): void {
        queueCache.clearTracks(guildId);
    }

    getNextTrack(guildId: string): MusicTrack | null {
        return queueCache.getNextTrack(guildId);
    }

    shuffleQueue(guildId: string): void {
        queueCache.shuffle(guildId);
    }

    unshuffleQueue(guildId: string): void {
        queueCache.unshuffle(guildId);
    }
    setCurrentTrack(guildId: string, track: MusicTrack | null): void {
        queueCache.setCurrentTrack(guildId, track);
        if (track) {
            guildMusicCache.addToRecentlyPlayed(guildId, track);
        }
    }

    getCurrentTrack(guildId: string): MusicTrack | null {
        return queueCache.getCurrentTrack(guildId);
    }

    togglePause(guildId: string): boolean {
        return queueCache.togglePause(guildId);
    }

    setLoopMode(guildId: string, mode: 'off' | 'track' | 'queue'): void {
        queueCache.setLoopMode(guildId, mode);
    }

    cycleLoopMode(guildId: string): 'off' | 'track' | 'queue' {
        return queueCache.cycleLoopMode(guildId);
    }

    getLoopCount(guildId: string): number {
        const queue = queueCache.get(guildId);
        return queue?.loopCount || 0;
    }

    incrementLoopCount(guildId: string): number {
        const queue = queueCache.get(guildId);
        if (!queue) return 0;
        queue.loopCount = (queue.loopCount || 0) + 1;
        return queue.loopCount;
    }

    resetLoopCount(guildId: string): void {
        const queue = queueCache.get(guildId);
        if (queue) queue.loopCount = 0;
    }

    setVolume(guildId: string, volume: number): number {
        return queueCache.setVolume(guildId, volume);
    }
    setNowPlayingMessage(guildId: string, message: { id: string; channelId: string } | MessageRef | null): void {
        queueCache.setNowPlayingMessage(guildId, message);
    }

    getNowPlayingMessage(guildId: string): MessageRef | null {
        return queueCache.getNowPlayingMessage(guildId);
    }

    clearNowPlayingMessage(guildId: string): void {
        queueCache.clearNowPlayingMessage(guildId);
    }
    startSkipVote(guildId: string, userId: string, listenerCount: number): VoteResult {
        return voteCache.startSkipVote(guildId, userId, listenerCount);
    }

    addSkipVote(guildId: string, userId: string): AddVoteResult | null {
        return voteCache.addSkipVote(guildId, userId);
    }

    endSkipVote(guildId: string): number {
        return voteCache.endSkipVote(guildId);
    }

    getRequiredVotes(listenerCount: number): number {
        return voteCache.getRequiredVotes(listenerCount);
    }

    hasEnoughSkipVotes(guildId: string): boolean {
        return voteCache.hasEnoughSkipVotes(guildId);
    }

    getVoteSkipStatus(guildId: string, listenerCount: number = 0): VoteSkipStatus {
        return voteCache.getVoteSkipStatus(guildId, listenerCount);
    }

    hasActiveSkipVote(guildId: string): boolean {
        return voteCache.hasActiveSkipVote(guildId);
    }

    setSkipVoteTimeout(guildId: string, timeout: NodeJS.Timeout): void {
        voteCache.setSkipVoteTimeout(guildId, timeout);
    }

    getSkipVoteListenerCount(guildId: string): number | null {
        const session = voteCache.getSkipVoteSession(guildId);
        return session?.listenerCount ?? null;
    }
    getDefaultPreferences(): UserPreferences {
        return userMusicCache.getDefaultPreferences();
    }

    async getPreferences(userId: string): Promise<UserPreferences> {
        return userMusicCache.getPreferences(userId);
    }

    async setPreferences(userId: string, preferences: Partial<UserPreferences>): Promise<UserPreferences> {
        return userMusicCache.setPreferences(userId, preferences);
    }

    async resetPreferences(userId: string): Promise<UserPreferences> {
        return userMusicCache.resetPreferences(userId);
    }
    async getFavorites(userId: string): Promise<FavoriteTrack[]> {
        return userMusicCache.getFavorites(userId);
    }

    async addFavorite(userId: string, track: any): Promise<AddFavoriteResult> {
        return userMusicCache.addFavorite(userId, track);
    }

    async removeFavorite(userId: string, trackUrl: string): Promise<FavoriteTrack[]> {
        return userMusicCache.removeFavorite(userId, trackUrl);
    }

    async isFavorited(userId: string, trackUrl: string): Promise<boolean> {
        return userMusicCache.isFavorited(userId, trackUrl);
    }
    async addToHistory(userId: string, track: any): Promise<HistoryTrack[]> {
        return userMusicCache.addToHistory(userId, track);
    }

    async getHistory(userId: string, limit: number = 20): Promise<HistoryTrack[]> {
        return userMusicCache.getHistory(userId, limit);
    }

    async clearHistory(userId: string): Promise<void> {
        await userMusicCache.clearHistory(userId);
    }
    addToRecentlyPlayed(guildId: string, track: MusicTrack): RecentlyPlayedTrack[] {
        return guildMusicCache.addToRecentlyPlayed(guildId, track);
    }

    getRecentlyPlayed(guildId: string, limit: number = 10): RecentlyPlayedTrack[] {
        return guildMusicCache.getRecentlyPlayed(guildId, limit);
    }
    setDJLock(guildId: string, enabled: boolean, djUserId: string | null = null): void {
        guildMusicCache.setDJLock(guildId, enabled, djUserId);
    }

    getDJLock(guildId: string): DJLockState {
        return guildMusicCache.getDJLock(guildId);
    }

    isDJ(guildId: string, userId: string): boolean {
        return guildMusicCache.isDJ(guildId, userId);
    }
    cachePlaylist(playlistUrl: string, playlistData: any): void {
        guildMusicCache.cachePlaylist(playlistUrl, playlistData);
    }

    getCachedPlaylist(playlistUrl: string): CachedPlaylist | null {
        return guildMusicCache.getCachedPlaylist(playlistUrl);
    }
    getDefaultGuildSettings(): GuildMusicSettings {
        return guildMusicCache.getDefaultSettings();
    }

    getGuildSettings(guildId: string): GuildMusicSettings {
        return guildMusicCache.getSettings(guildId);
    }

    setGuildSettings(guildId: string, settings: Partial<GuildMusicSettings>): GuildMusicSettings {
        return guildMusicCache.setSettings(guildId, settings);
    }

    resetGuildSettings(guildId: string): GuildMusicSettings {
        return guildMusicCache.resetSettings(guildId);
    }
    cleanupGuild(guildId: string): void {
        queueCache.delete(guildId);
        voteCache.cleanupGuild(guildId);
        guildMusicCache.cleanupGuild(guildId);
    }

    stopCleanupInterval(): void {
        if (this._cleanupInterval) {
            clearInterval(this._cleanupInterval);
        }
    }

    private _runGlobalCleanup(): void {
        queueCache.cleanup();
        userMusicCache.cleanup();
        voteCache.cleanup();
        guildMusicCache.cleanup();
    }
    async getStats(): Promise<MusicCacheStats> {
        return {
            queue: queueCache.getStats(),
            user: await userMusicCache.getStats(),
            vote: voteCache.getStats(),
            guild: guildMusicCache.getStats(),
        };
    }

    /**
     * Get all active guild IDs with music queues
     */
    getAllActiveGuildIds(): string[] {
        return queueCache.getActiveGuildIds();
    }
    shutdown(): void {
        this.stopCleanupInterval();
        queueCache.shutdown();
        userMusicCache.shutdown();
        voteCache.shutdown();
        guildMusicCache.shutdown();
        logger.debug('MusicCache', 'All caches shutdown');
    }
}

// Export singleton (backward compatible)
export const musicCacheFacade = new MusicCacheFacade();
export default musicCacheFacade;
