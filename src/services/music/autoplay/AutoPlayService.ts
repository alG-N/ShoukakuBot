import lavalinkService from '../core/LavalinkService.js';
import { queueService } from '../queue/index.js';
import logger from '../../../core/observability/Logger.js';
import type { MusicTrack, TrackInfo } from '../events/MusicEvents.js';

/**
 * Simple AutoPlay Service
 * 
 * How it works:
 * 1. When queue ends, take the last track's artist + title
 * 2. Build 2-3 simple search queries (artist songs, similar songs, genre mix)
 * 3. Search both YouTube + YouTube Music for diverse results
 * 4. Filter out recently played tracks (cooldown = 12 tracks)
 * 5. Pick a random track from results, preferring different artists
 */

const COOLDOWN_SIZE = 12;

class AutoPlayService {
    private readonly MIN_SEARCH_INTERVAL = 3000;
    private recentArtists = new Map<string, string[]>();

    async findSimilarTrack(guildId: string, lastTrack: MusicTrack): Promise<MusicTrack | null> {
        const queue = queueService.get(guildId);
        const now = Date.now();

        // Rate limit
        if (queue?.lastAutoplaySearch && (now - queue.lastAutoplaySearch) < this.MIN_SEARCH_INTERVAL) {
            return null;
        }
        if (queue) queue.lastAutoplaySearch = now;

        const trackInfo = lastTrack?.info || lastTrack;
        const title = trackInfo?.title;
        const author = trackInfo?.author;

        if (!title) return null;

        const recentTitles = queue?.lastPlayedTracks || [];
        const cleanTitle = this._cleanTitle(title);
        const cleanAuthor = this._cleanAuthor(author || '');

        logger.info('AutoPlay', `Finding similar to: "${cleanTitle}" by "${cleanAuthor}"`);

        // Track this artist
        if (cleanAuthor) this._trackArtist(guildId, cleanAuthor);

        // Build simple search queries
        const queries = this._buildQueries(cleanTitle, cleanAuthor, guildId);

        // Try each query
        for (const query of queries) {
            try {
                logger.info('AutoPlay', `Searching: "${query}"`);
                const results = await this._searchBothPlatforms(query, 8);

                if (results.length > 0) {
                    const valid = this._filterPlayed(results, recentTitles, title);
                    if (valid.length > 0) {
                        const picked = this._pickTrack(valid, cleanAuthor, guildId);
                        logger.info('AutoPlay', `Selected: "${picked.info?.title}" by "${picked.info?.author}"`);
                        return picked;
                    }
                }
            } catch {
                continue;
            }
        }

        // Last resort fallback
        try {
            const fallback = await this._searchBothPlatforms('popular music mix', 8);
            const valid = this._filterPlayed(fallback, recentTitles, title);
            if (valid.length > 0) return this._pickTrack(valid, cleanAuthor, guildId);
        } catch { /* exhausted */ }

        logger.warn('AutoPlay', 'No track found');
        return null;
    }

    getLastMoodProfile(): string | null {
        return null;
    }

    // --- Query building ---

    private _buildQueries(title: string, author: string, guildId: string): string[] {
        const queries: string[] = [];

        // If we've been hearing the same artist too much, pivot away
        const isRepeatArtist = author && this._isRecentArtist(guildId, author);

        if (author) {
            if (isRepeatArtist) {
                // Try to find different artists with similar style
                queries.push(`music like ${author}`);
                queries.push(`${title.split(' ').slice(0, 3).join(' ')} songs`);
            } else {
                // Same artist is fine, also try similar
                queries.push(`${author} songs`);
                queries.push(`music similar to ${author} ${title.split(' ')[0] || ''}`);
            }
        }

        // Always add a title-based query
        const titleWords = title.split(' ').filter(w => w.length > 2).slice(0, 3);
        if (titleWords.length > 0) {
            queries.push(`${titleWords.join(' ')} ${author}`.trim());
        }

        return queries;
    }

    // --- Search ---

    private async _searchBothPlatforms(query: string, limit: number): Promise<MusicTrack[]> {
        const searchMultiple = (lavalinkService as { searchMultiple?: (q: string, l: number, p?: string) => Promise<MusicTrack[]> }).searchMultiple;

        if (!searchMultiple) {
            const result = await lavalinkService.search(query, undefined);
            return result?.track ? [result as MusicTrack] : [];
        }

        // Search YouTube Music + YouTube in parallel
        const [ytm, yt] = await Promise.all([
            searchMultiple(query, Math.ceil(limit / 2), 'ytmsearch').catch(() => [] as MusicTrack[]),
            searchMultiple(query, Math.ceil(limit / 2), 'ytsearch').catch(() => [] as MusicTrack[]),
        ]);

        // Merge + deduplicate
        const combined: MusicTrack[] = [...ytm];
        const seen = new Set(combined.map(t => (t.info?.title || '').toLowerCase().substring(0, 30)));

        for (const track of yt) {
            const key = (track.info?.title || '').toLowerCase().substring(0, 30);
            if (!seen.has(key)) {
                combined.push(track);
                seen.add(key);
            }
        }

        return combined.slice(0, limit);
    }

    // --- Filtering ---

    private _filterPlayed(results: MusicTrack[], recentTitles: string[], currentTitle: string): MusicTrack[] {
        const current = currentTitle.toLowerCase();

        return results.filter(r => {
            const t = (r.info?.title || '').toLowerCase();

            // Exact or near match with current
            if (t === current) return false;
            if (t.length > 15 && current.length > 15) {
                if (t.substring(0, 20) === current.substring(0, 20)) return false;
            }

            // Match with recently played
            const isRecent = recentTitles.some(recent => {
                const lr = recent.toLowerCase();
                const len = Math.min(lr.length, t.length, 25);
                return lr.substring(0, len) === t.substring(0, len) ||
                    lr.includes(t.substring(0, 20)) ||
                    t.includes(lr.substring(0, 20));
            });
            if (isRecent) return false;

            // Skip streams
            if (r.info && 'isStream' in r.info && r.info.isStream) return false;

            // Skip non-music content
            if (/\b(podcast|interview|reaction|commentary|review|tutorial|audiobook|lecture|vlog|unboxing)\b/i.test(r.info?.title || '')) return false;

            // Skip very long tracks (>12min)
            const durMs = (r.info as any)?.length;
            const durSec = (r as any).lengthSeconds || (durMs ? Math.floor(durMs / 1000) : 0);
            if (durSec > 720) return false;

            // Skip compilations/mixes
            if (/\b(mix|playlist|compilation|medley|megamix|nonstop)\b/i.test(r.info?.title || '')) return false;

            return true;
        });
    }

    // --- Picking ---

    private _pickTrack(tracks: MusicTrack[], lastAuthor: string, guildId: string): MusicTrack {
        if (tracks.length === 1) return tracks[0]!;

        // Score: prefer different artists, avoid very short/long, add randomness
        const scored = tracks.map(track => {
            let score = Math.random() * 10; // base randomness
            const trackAuthor = this._cleanAuthor(track.info?.author || '').toLowerCase();
            const isSame = lastAuthor && trackAuthor.includes(lastAuthor.toLowerCase().substring(0, 10));
            const isRecent = this._isRecentArtist(guildId, trackAuthor);

            // Prefer different artists
            if (isSame) score -= 15;
            else if (isRecent) score -= 8;
            else score += 10;

            // Prefer normal song duration (2-6 min)
            const durMs = (track.info as any)?.length;
            const durSec = (track as any).lengthSeconds || (durMs ? Math.floor(durMs / 1000) : 0);
            if (durSec >= 120 && durSec <= 360) score += 5;
            else if (durSec > 360 && durSec <= 480) score += 2;

            return { track, score };
        });

        scored.sort((a, b) => b.score - a.score);

        // Pick from top 3 with weighted random
        const top = scored.slice(0, Math.min(3, scored.length));
        const total = top.reduce((s, t) => s + Math.max(t.score, 1), 0);
        let rand = Math.random() * total;
        for (const { track, score } of top) {
            rand -= Math.max(score, 1);
            if (rand <= 0) {
                const a = this._cleanAuthor(track.info?.author || '');
                if (a) this._trackArtist(guildId, a);
                return track;
            }
        }

        return top[0]!.track;
    }

    // --- Artist tracking (prevent same artist spam) ---

    private _trackArtist(guildId: string, artist: string): void {
        if (!artist || artist.length < 2) return;
        let list = this.recentArtists.get(guildId);
        if (!list) { list = []; this.recentArtists.set(guildId, list); }
        const clean = artist.toLowerCase().trim();
        if (list[list.length - 1]?.toLowerCase() === clean) return;
        list.push(clean);
        while (list.length > COOLDOWN_SIZE) list.shift();
    }

    private _isRecentArtist(guildId: string, artist: string): boolean {
        const list = this.recentArtists.get(guildId);
        if (!list || !artist) return false;
        const clean = artist.toLowerCase().trim();
        return list.some(a => a.includes(clean.substring(0, 10)) || clean.includes(a.substring(0, 10)));
    }

    // --- Cleaners ---

    private _cleanTitle(title: string): string {
        return title
            .replace(/\(official.*?\)/gi, '')
            .replace(/\[.*?\]/gi, '')
            .replace(/\|.*$/gi, '')
            .replace(/ft\.?.*$/gi, '')
            .replace(/feat\.?.*$/gi, '')
            .replace(/\(.*?remix.*?\)/gi, '')
            .replace(/\(.*?cover.*?\)/gi, '')
            .replace(/-\s*(lyrics|audio|video|music\s*video|mv|pv)/gi, '')
            .replace(/\(lyrics?\)/gi, '')
            .replace(/\s{2,}/g, ' ')
            .trim();
    }

    private _cleanAuthor(author: string): string {
        return author
            .replace(/\s*-\s*Topic$/gi, '')
            .replace(/VEVO$/gi, '')
            .replace(/Official$/gi, '')
            .replace(/\s*Music\s*$/gi, '')
            .replace(/\s*Channel\s*$/gi, '')
            .trim();
    }
}

const autoPlayService = new AutoPlayService();

export { AutoPlayService };
export default autoPlayService;

