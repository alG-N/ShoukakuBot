/**
 * Spotify Service (Simplified — Embed Scraping + Client Credentials)
 * Uses Client Credentials for API access (recommendations, search, audio features).
 * Uses embed scraping for playlist/album track extraction (no auth needed).
 * 
 * Features:
 * - Track search & metadata
 * - Recommendations API (genre/artist/track seeds)
 * - Artist genre fetching
 * - Audio features & mood profiling
 * - Playlist/album embed scraping
 * 
 * @module services/music/spotify/SpotifyService
 */

import logger from '../../../core/Logger.js';

// ── TYPES ────────────────────────────────────────────────────────────

export interface SpotifyToken {
    accessToken: string;
    expiresAt: number;
}

export interface SpotifyTrack {
    id: string;
    name: string;
    artists: SpotifyArtist[];
    album: SpotifyAlbum;
    duration_ms: number;
    uri: string;
    external_urls: { spotify: string };
    popularity: number;
    preview_url: string | null;
}

export interface SpotifyArtist {
    id: string;
    name: string;
    genres?: string[];
    external_urls: { spotify: string };
}

export interface SpotifyAlbum {
    id: string;
    name: string;
    images: { url: string; width: number; height: number }[];
    release_date: string;
}

export interface SpotifySearchResult {
    tracks: {
        items: SpotifyTrack[];
        total: number;
    };
}

/** Track info extracted from embed scraping */
export interface EmbedTrack {
    title: string;
    artist: string;
    duration_ms: number;
    artworkUrl?: string;
    isrc?: string;
}

// ── SPOTIFY SERVICE ──────────────────────────────────────────────────

class SpotifyService {
    private readonly BASE_URL = 'https://api.spotify.com/v1';
    private readonly AUTH_URL = 'https://accounts.spotify.com/api/token';
    
    private clientId: string;
    private clientSecret: string;
    private token: SpotifyToken | null = null;
    
    /** Rate limit tracking */
    private lastRequestTime = 0;
    private readonly MIN_REQUEST_INTERVAL = 100; // 100ms between requests

    constructor() {
        this.clientId = process.env.SPOTIFY_CLIENT_ID || '';
        this.clientSecret = process.env.SPOTIFY_CLIENT_SECRET || '';
        
        if (this.clientId && this.clientSecret) {
            logger.info('Spotify', 'Service initialized (Client Credentials)');
        } else {
            logger.warn('Spotify', 'Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET — Spotify features disabled');
        }
    }

    // ── AUTH ──────────────────────────────────────────────────────────

    /** Check if Spotify credentials are configured */
    isConfigured(): boolean {
        return !!(this.clientId && this.clientSecret);
    }

    /** Get a valid access token (auto-refresh if expired) */
    private async getAccessToken(): Promise<string> {
        if (this.token && Date.now() < this.token.expiresAt - 60_000) {
            return this.token.accessToken;
        }

        const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

        try {
            const response = await fetch(this.AUTH_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `Basic ${credentials}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: 'grant_type=client_credentials',
            });

            if (!response.ok) {
                throw new Error(`Spotify auth failed: ${response.status} ${response.statusText}`);
            }

            const data = await response.json() as { access_token: string; expires_in: number; token_type: string };
            
            this.token = {
                accessToken: data.access_token,
                expiresAt: Date.now() + (data.expires_in * 1000),
            };

            logger.info('Spotify', `Token obtained, expires in ${data.expires_in}s`);
            return this.token.accessToken;
        } catch (error) {
            const err = error as Error;
            logger.error('Spotify', `Auth error: ${err.message}`);
            throw err;
        }
    }

    /** Make an authenticated request to Spotify API */
    private async apiRequest<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
        if (!this.isConfigured()) {
            throw new Error('Spotify not configured');
        }

        // Rate limiting
        const now = Date.now();
        const elapsed = now - this.lastRequestTime;
        if (elapsed < this.MIN_REQUEST_INTERVAL) {
            await new Promise(resolve => setTimeout(resolve, this.MIN_REQUEST_INTERVAL - elapsed));
        }
        this.lastRequestTime = Date.now();

        const token = await this.getAccessToken();
        const url = new URL(`${this.BASE_URL}${endpoint}`);
        if (params) {
            Object.entries(params).forEach(([key, value]) => url.searchParams.append(key, value));
        }

        const response = await fetch(url.toString(), {
            headers: { 'Authorization': `Bearer ${token}` },
        });

        if (response.status === 429) {
            const retryAfter = parseInt(response.headers.get('Retry-After') || '5', 10);
            logger.warn('Spotify', `Rate limited, retrying after ${retryAfter}s`);
            await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
            return this.apiRequest<T>(endpoint, params);
        }

        // Invalidate token on 401 and retry once
        if (response.status === 401 && this.token) {
            logger.warn('Spotify', 'Token rejected (401), refreshing and retrying...');
            this.token = null;
            return this.apiRequest<T>(endpoint, params);
        }

        if (!response.ok) {
            const errorBody = await response.text().catch(() => '');
            throw new Error(`Spotify API error: ${response.status} ${response.statusText} — ${errorBody}`);
        }

        return response.json() as Promise<T>;
    }

    // ── SEARCH ───────────────────────────────────────────────────────

    /** Search for tracks on Spotify */
    async searchTrack(query: string, limit: number = 5): Promise<SpotifyTrack[]> {
        try {
            const result = await this.apiRequest<SpotifySearchResult>('/search', {
                q: query,
                type: 'track',
                limit: String(limit),
                market: 'US',
            });
            return result.tracks?.items || [];
        } catch (error) {
            logger.error('Spotify', `Search error: ${(error as Error).message}`);
            return [];
        }
    }

    /** Get a track by Spotify ID */
    async getTrack(trackId: string): Promise<SpotifyTrack | null> {
        try {
            return await this.apiRequest<SpotifyTrack>(`/tracks/${trackId}`);
        } catch {
            return null;
        }
    }

    /** Search Spotify for a track by title + artist, return the best match */
    async findTrack(title: string, artist?: string): Promise<SpotifyTrack | null> {
        const query = artist ? `track:${title} artist:${artist}` : title;
        const results = await this.searchTrack(query, 1);
        return results[0] || null;
    }

    // ── PLAYLIST / ALBUM (EMBED SCRAPING) ────────────────────────────

    /** Get playlist tracks via embed scraping (no auth required) */
    async getPlaylistTracks(playlistId: string, limit: number = 100): Promise<EmbedTrack[]> {
        try {
            const tracks = await this._scrapeEmbed('playlist', playlistId, limit);
            logger.info('Spotify', `Scraped ${tracks.length} tracks from playlist ${playlistId}`);
            return tracks;
        } catch (error) {
            logger.error('Spotify', `getPlaylistTracks failed: ${(error as Error).message}`);
            return [];
        }
    }

    /** Get album tracks via embed scraping (no auth required) */
    async getAlbumTracks(albumId: string, limit = 100): Promise<EmbedTrack[]> {
        try {
            const tracks = await this._scrapeEmbed('album', albumId, limit);
            logger.info('Spotify', `Scraped ${tracks.length} tracks from album ${albumId}`);
            return tracks;
        } catch (error) {
            logger.error('Spotify', `getAlbumTracks failed: ${(error as Error).message}`);
            return [];
        }
    }

    /**
     * Scrape Spotify embed page to get tracks (no auth required).
     * Works for both playlists and albums.
     */
    private async _scrapeEmbed(type: 'playlist' | 'album', id: string, limit: number = 100): Promise<EmbedTrack[]> {
        const embedUrl = `https://open.spotify.com/embed/${type}/${id}`;
        
        const response = await fetch(embedUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml',
            },
        });

        if (!response.ok) {
            throw new Error(`Embed page returned ${response.status}`);
        }

        const html = await response.text();
        const tracks: EmbedTrack[] = [];

        // Try extracting from __NEXT_DATA__ script tag
        const nextDataMatch = html.match(/<script\s+id="__NEXT_DATA__"\s+type="application\/json"[^>]*>([\s\S]*?)<\/script>/);
        if (nextDataMatch) {
            try {
                const nextData = JSON.parse(nextDataMatch[1]);
                const entity = nextData?.props?.pageProps?.state?.data?.entity;
                const trackList = entity?.trackList || entity?.tracks?.items || [];

                for (const item of trackList) {
                    if (tracks.length >= limit) break;
                    const track = item.track || item;
                    const title = track?.name || track?.title;
                    if (!title) continue;

                    tracks.push({
                        title,
                        artist: track?.artists?.map((a: { name: string }) => a.name).join(', ') || track?.subtitle || '',
                        duration_ms: track?.duration_ms || track?.duration || 0,
                        artworkUrl: track?.album?.images?.[0]?.url || track?.coverArt?.sources?.[0]?.url || entity?.images?.[0]?.url || entity?.coverArt?.sources?.[0]?.url,
                    });
                }
            } catch {
                // __NEXT_DATA__ parse failed, continue to other methods
            }
        }

        // Fallback: try window.__RESOURCE__
        if (tracks.length === 0) {
            const resourceMatch = html.match(/<script[^>]*>\s*window\.__RESOURCE__\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
            if (resourceMatch) {
                try {
                    const resource = JSON.parse(resourceMatch[1]);
                    const items = resource?.tracks?.items || resource?.trackList || [];
                    for (const item of items) {
                        if (tracks.length >= limit) break;
                        const track = item.track || item;
                        if (track?.name || track?.title) {
                            tracks.push({
                                title: track.name || track.title,
                                artist: track.artists?.map((a: { name: string }) => a.name).join(', ') || '',
                                duration_ms: track.duration_ms || 0,
                                artworkUrl: track.album?.images?.[0]?.url,
                            });
                        }
                    }
                } catch {
                    // Ignore parse errors
                }
            }
        }

        // Fallback: extract from any large JSON with track data
        if (tracks.length === 0) {
            const jsonBlocks = html.matchAll(/<script[^>]*>(\{"props"[\s\S]*?\})<\/script>/g);
            for (const match of jsonBlocks) {
                try {
                    const data = JSON.parse(match[1]);
                    const items = this._findTrackList(data);
                    for (const track of items) {
                        if (tracks.length >= limit) break;
                        if (track?.name || track?.title) {
                            tracks.push({
                                title: track.name || track.title,
                                artist: track.artists?.map((a: { name: string }) => a.name).join(', ') || track.subtitle || '',
                                duration_ms: track.duration_ms || track.duration || 0,
                                artworkUrl: track.album?.images?.[0]?.url || track.coverArt?.sources?.[0]?.url,
                            });
                        }
                    }
                } catch {
                    continue;
                }
            }
        }

        if (tracks.length === 0) {
            throw new Error('No tracks found in embed page — Spotify may have changed their embed format');
        }

        return tracks;
    }

    /** Recursively search an object for an array that looks like a track list */
    private _findTrackList(obj: any, depth = 0): any[] {
        if (depth > 8 || !obj || typeof obj !== 'object') return [];

        if (Array.isArray(obj.trackList) && obj.trackList.length > 0) return obj.trackList;
        if (Array.isArray(obj.items) && obj.items.length > 0) {
            const first = obj.items[0]?.track || obj.items[0];
            if (first?.name && first?.artists) return obj.items;
        }

        for (const key of Object.keys(obj)) {
            const result = this._findTrackList(obj[key], depth + 1);
            if (result.length > 0) return result;
        }
        return [];
    }

    // ── URL EXTRACTION ───────────────────────────────────────────────

    /** Extract Spotify track/album/playlist/artist ID from URL */
    extractSpotifyId(url: string): { type: 'track' | 'album' | 'playlist' | 'artist'; id: string } | null {
        // Handle /intl-XX/ locale prefix in newer Spotify URLs
        const match = url.match(/spotify\.com\/(?:intl-[a-z]{2}\/)?(?:intl\/[a-z]{2}\/)?(?:embed\/)?(track|album|playlist|artist)\/([a-zA-Z0-9]+)/);
        if (!match) return null;
        return { type: match[1] as any, id: match[2] };
    }

    // ── CLEANUP ──────────────────────────────────────────────────────

    /** Shutdown — clear all caches */
    shutdown(): void {
        this.token = null;
        logger.info('Spotify', 'Service shut down');
    }
}

// Singleton export
const spotifyService = new SpotifyService();
export { SpotifyService };
export default spotifyService;
