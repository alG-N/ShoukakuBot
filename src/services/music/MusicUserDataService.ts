/**
 * Music Facade — User Data Service
 * Handles favorites, history, preferences — pure delegation to musicCache.
 * Extracted from MusicFacade.ts for modularity.
 * @module services/music/MusicUserDataService
 */

import musicCache from '../../cache/music/MusicCacheFacade.js';
import type { Track } from './MusicTypes.js';

export class MusicUserDataService {
    async addFavorite(userId: string, track: Track): Promise<any> {
        return musicCache.addFavorite(userId, track);
    }

    async removeFavorite(userId: string, trackUrl: string): Promise<any> {
        return musicCache.removeFavorite(userId, trackUrl);
    }

    async getFavorites(userId: string): Promise<any[]> {
        return musicCache.getFavorites(userId);
    }

    async isFavorited(userId: string, trackUrl: string): Promise<boolean> {
        return musicCache.isFavorited(userId, trackUrl);
    }

    async addToHistory(userId: string, track: Track): Promise<void> {
        await musicCache.addToHistory(userId, track);
    }

    async getHistory(userId: string, limit?: number): Promise<any[]> {
        return musicCache.getHistory(userId, limit);
    }

    async clearHistory(userId: string): Promise<void> {
        await musicCache.clearHistory(userId);
    }

    async getPreferences(userId: string): Promise<any> {
        return musicCache.getPreferences(userId);
    }

    async setPreferences(userId: string, prefs: any): Promise<void> {
        await musicCache.setPreferences(userId, prefs);
    }

    getRecentlyPlayed(guildId: string): any[] {
        return musicCache.getRecentlyPlayed(guildId);
    }
}
