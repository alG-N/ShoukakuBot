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

export interface SpotifyRecommendation {
    tracks: SpotifyTrack[];
    seeds: SpotifyRecommendationSeed[];
}

export interface SpotifyRecommendationSeed {
    id: string;
    type: 'track' | 'artist' | 'genre';
    initialPoolSize: number;
    afterFilteringSize: number;
}

export interface SpotifySearchResult {
    tracks: {
        items: SpotifyTrack[];
        total: number;
    };
}

export interface SpotifyAudioFeatures {
    id: string;
    energy: number;         // 0.0 - 1.0
    valence: number;        // 0.0 - 1.0 (happiness)
    danceability: number;   // 0.0 - 1.0
    tempo: number;          // BPM
    acousticness: number;   // 0.0 - 1.0
    instrumentalness: number; // 0.0 - 1.0
    liveness: number;       // 0.0 - 1.0
    speechiness: number;    // 0.0 - 1.0
    loudness: number;       // dB
    mode: number;           // 0 = minor, 1 = major
    key: number;            // 0-11
}

/** Mood profile derived from audio features */
export interface MoodProfile {
    mood: 'chill' | 'energetic' | 'melancholic' | 'happy' | 'intense' | 'neutral';
    energy: number;
    valence: number;
    danceability: number;
    tempo: number;
    acousticness: number;
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
    
    /** Cache for genre seeds — refreshed every 24h */
    private genreSeedsCache: string[] = [];
    private genreSeedsCacheTime = 0;
    
    /** Cache for artist genres — Map<artistId, genres[]> */
    private artistGenreCache = new Map<string, { genres: string[]; expiresAt: number }>();
    
    /** Cache for audio features — Map<trackId, features> */
    private audioFeaturesCache = new Map<string, { features: SpotifyAudioFeatures; expiresAt: number }>();
    
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

    // ── ARTIST GENRES ────────────────────────────────────────────────

    /** Get genres for an artist by ID (cached 1h) */
    async getArtistGenres(artistId: string): Promise<string[]> {
        const cached = this.artistGenreCache.get(artistId);
        if (cached && Date.now() < cached.expiresAt) {
            return cached.genres;
        }

        try {
            const artist = await this.apiRequest<SpotifyArtist>(`/artists/${artistId}`);
            const genres = artist.genres || [];
            
            this.artistGenreCache.set(artistId, {
                genres,
                expiresAt: Date.now() + 3600_000,
            });

            return genres;
        } catch {
            return [];
        }
    }

    /** Get genres for multiple artists at once (batch, max 50 per request) */
    async getMultipleArtistGenres(artistIds: string[]): Promise<Map<string, string[]>> {
        const result = new Map<string, string[]>();
        const uncachedIds: string[] = [];

        for (const id of artistIds) {
            const cached = this.artistGenreCache.get(id);
            if (cached && Date.now() < cached.expiresAt) {
                result.set(id, cached.genres);
            } else {
                uncachedIds.push(id);
            }
        }

        if (uncachedIds.length > 0) {
            const batches = [];
            for (let i = 0; i < uncachedIds.length; i += 50) {
                batches.push(uncachedIds.slice(i, i + 50));
            }

            for (const batch of batches) {
                try {
                    const data = await this.apiRequest<{ artists: SpotifyArtist[] }>('/artists', {
                        ids: batch.join(','),
                    });

                    for (const artist of data.artists) {
                        if (artist) {
                            const genres = artist.genres || [];
                            result.set(artist.id, genres);
                            this.artistGenreCache.set(artist.id, {
                                genres,
                                expiresAt: Date.now() + 3600_000,
                            });
                        }
                    }
                } catch (error) {
                    logger.error('Spotify', `Batch artist genres error: ${(error as Error).message}`);
                }
            }
        }

        return result;
    }

    // ── AUDIO FEATURES ───────────────────────────────────────────────

    /** Get audio features for a track (energy, valence, danceability, tempo, etc.) */
    async getAudioFeatures(trackId: string): Promise<SpotifyAudioFeatures | null> {
        const cached = this.audioFeaturesCache.get(trackId);
        if (cached && Date.now() < cached.expiresAt) {
            return cached.features;
        }

        try {
            const features = await this.apiRequest<SpotifyAudioFeatures>(`/audio-features/${trackId}`);
            
            this.audioFeaturesCache.set(trackId, {
                features,
                expiresAt: Date.now() + 3600_000,
            });

            return features;
        } catch {
            return null;
        }
    }

    /** Get audio features for multiple tracks (batch, max 100 per request) */
    async getMultipleAudioFeatures(trackIds: string[]): Promise<Map<string, SpotifyAudioFeatures>> {
        const result = new Map<string, SpotifyAudioFeatures>();
        const uncachedIds: string[] = [];

        for (const id of trackIds) {
            const cached = this.audioFeaturesCache.get(id);
            if (cached && Date.now() < cached.expiresAt) {
                result.set(id, cached.features);
            } else {
                uncachedIds.push(id);
            }
        }

        if (uncachedIds.length > 0) {
            const batches = [];
            for (let i = 0; i < uncachedIds.length; i += 100) {
                batches.push(uncachedIds.slice(i, i + 100));
            }

            for (const batch of batches) {
                try {
                    const data = await this.apiRequest<{ audio_features: (SpotifyAudioFeatures | null)[] }>('/audio-features', {
                        ids: batch.join(','),
                    });

                    for (const feature of data.audio_features) {
                        if (feature) {
                            result.set(feature.id, feature);
                            this.audioFeaturesCache.set(feature.id, {
                                features: feature,
                                expiresAt: Date.now() + 3600_000,
                            });
                        }
                    }
                } catch (error) {
                    logger.error('Spotify', `Batch audio features error: ${(error as Error).message}`);
                }
            }
        }

        return result;
    }

    /** Derive a mood profile from audio features */
    deriveMoodProfile(features: SpotifyAudioFeatures): MoodProfile {
        const { energy, valence, danceability, tempo, acousticness } = features;

        let mood: MoodProfile['mood'];

        if (energy < 0.35 && valence < 0.35) {
            mood = 'melancholic';
        } else if (energy < 0.4 && acousticness > 0.5) {
            mood = 'chill';
        } else if (energy < 0.45 && valence < 0.5) {
            mood = 'chill';
        } else if (energy > 0.75 && valence > 0.6) {
            mood = 'happy';
        } else if (energy > 0.8) {
            mood = 'intense';
        } else if (energy > 0.6 && danceability > 0.6) {
            mood = 'energetic';
        } else if (valence > 0.65) {
            mood = 'happy';
        } else {
            mood = 'neutral';
        }

        return { mood, energy, valence, danceability, tempo, acousticness };
    }

    // ── RECOMMENDATIONS ──────────────────────────────────────────────

    /**
     * Get recommendations from Spotify based on seed tracks/artists/genres.
     * Core of genre-aware autoplay.
     */
    async getRecommendations(options: {
        seedTracks?: string[];
        seedArtists?: string[];
        seedGenres?: string[];
        targetEnergy?: number;
        targetValence?: number;
        targetDanceability?: number;
        targetTempo?: number;
        minEnergy?: number;
        maxEnergy?: number;
        minValence?: number;
        maxValence?: number;
        limit?: number;
    }): Promise<SpotifyTrack[]> {
        const params: Record<string, string> = {
            limit: String(options.limit || 10),
            market: 'US',
        };

        // Seeds (max 5 total across all seed types)
        const seeds: string[] = [];
        if (options.seedTracks?.length) {
            params.seed_tracks = options.seedTracks.slice(0, 5).join(',');
            seeds.push(...options.seedTracks.slice(0, 5));
        }
        if (options.seedArtists?.length) {
            const remaining = 5 - seeds.length;
            if (remaining > 0) {
                params.seed_artists = options.seedArtists.slice(0, remaining).join(',');
                seeds.push(...options.seedArtists.slice(0, remaining));
            }
        }
        if (options.seedGenres?.length) {
            const remaining = 5 - seeds.length;
            if (remaining > 0) {
                params.seed_genres = options.seedGenres.slice(0, remaining).join(',');
            }
        }

        if (!params.seed_tracks && !params.seed_artists && !params.seed_genres) {
            logger.warn('Spotify', 'No seeds provided for recommendations');
            return [];
        }

        // Tuning parameters
        if (options.targetEnergy !== undefined) params.target_energy = String(options.targetEnergy);
        if (options.targetValence !== undefined) params.target_valence = String(options.targetValence);
        if (options.targetDanceability !== undefined) params.target_danceability = String(options.targetDanceability);
        if (options.targetTempo !== undefined) params.target_tempo = String(options.targetTempo);
        if (options.minEnergy !== undefined) params.min_energy = String(options.minEnergy);
        if (options.maxEnergy !== undefined) params.max_energy = String(options.maxEnergy);
        if (options.minValence !== undefined) params.min_valence = String(options.minValence);
        if (options.maxValence !== undefined) params.max_valence = String(options.maxValence);

        try {
            const data = await this.apiRequest<SpotifyRecommendation>('/recommendations', params);
            logger.info('Spotify', `Recommendations: ${data.tracks?.length || 0} tracks from ${data.seeds?.length || 0} seeds`);
            return data.tracks || [];
        } catch (error) {
            const errMsg = (error as Error).message;
            // Spotify may have deprecated /recommendations (404).
            // Log once and let AutoPlay fall through to YouTube strategies.
            if (errMsg.includes('404')) {
                logger.warn('Spotify', 'Recommendations endpoint returned 404 (possibly deprecated)');
            } else {
                logger.error('Spotify', `Recommendations error: ${errMsg}`);
            }
            return [];
        }
    }

    // ── GENRE SEEDS ──────────────────────────────────────────────────

    /**
     * Hardcoded genre seeds fallback.
     * Spotify deprecated /recommendations/available-genre-seeds (returns 404).
     * This list covers the genres we actually use in mapToSpotifyGenres().
     */
    private static readonly FALLBACK_GENRE_SEEDS: string[] = [
        'acoustic', 'alt-rock', 'alternative', 'ambient', 'anime',
        'blues', 'chill', 'classical', 'country', 'dance',
        'deep-house', 'disco', 'drum-and-bass', 'dub', 'dubstep',
        'edm', 'electronic', 'folk', 'funk', 'grunge',
        'happy', 'heavy-metal', 'hip-hop', 'house', 'indie',
        'indie-pop', 'j-pop', 'jazz', 'k-pop', 'latin',
        'mandopop', 'metal', 'piano', 'pop', 'post-rock',
        'punk', 'punk-rock', 'r-n-b', 'reggae', 'reggaeton',
        'rock', 'sad', 'shoegaze', 'soul', 'techno',
        'trance',
    ];

    /** Get available genre seeds for the recommendations API (cached daily) */
    async getAvailableGenreSeeds(): Promise<string[]> {
        if (this.genreSeedsCache.length > 0 && Date.now() - this.genreSeedsCacheTime < 86400_000) {
            return this.genreSeedsCache;
        }

        try {
            const data = await this.apiRequest<{ genres: string[] }>('/recommendations/available-genre-seeds');
            this.genreSeedsCache = data.genres || [];
            this.genreSeedsCacheTime = Date.now();
            logger.info('Spotify', `Loaded ${this.genreSeedsCache.length} genre seeds`);
            return this.genreSeedsCache;
        } catch (error) {
            const errMsg = (error as Error).message;
            // Spotify deprecated this endpoint (404). Use hardcoded fallback.
            if (errMsg.includes('404')) {
                logger.warn('Spotify', 'Genre seeds endpoint deprecated (404), using hardcoded fallback');
                this.genreSeedsCache = SpotifyService.FALLBACK_GENRE_SEEDS;
                this.genreSeedsCacheTime = Date.now();
                return this.genreSeedsCache;
            }
            logger.error('Spotify', `Genre seeds error: ${errMsg}`);
            return SpotifyService.FALLBACK_GENRE_SEEDS;
        }
    }

    /**
     * Map detected genres to valid Spotify genre seeds.
     * Spotify's genre seeds are a fixed list; this maps our genres to theirs.
     */
    async mapToSpotifyGenres(detectedGenres: string[]): Promise<string[]> {
        const availableSeeds = await this.getAvailableGenreSeeds();
        if (availableSeeds.length === 0) return [];

        const genreMapping: Record<string, string[]> = {
            'lofi': ['chill'],
            'edm': ['edm', 'electronic'],
            'rock': ['rock', 'alt-rock', 'indie'],
            'metal': ['metal', 'heavy-metal'],
            'punk': ['punk', 'punk-rock'],
            'jazz': ['jazz'],
            'blues': ['blues'],
            'hip hop': ['hip-hop'],
            'trap': ['hip-hop'],
            'kpop': ['k-pop'],
            'jpop': ['j-pop'],
            'cpop': ['mandopop'],
            'pop': ['pop'],
            'anime': ['anime', 'j-pop'],
            'nightcore': ['electronic'],
            'remix': ['electronic', 'edm'],
            'acoustic': ['acoustic'],
            'instrumental': ['piano', 'classical'],
            'chill': ['chill'],
            'classical': ['classical'],
            'r&b': ['r-n-b'],
            'country': ['country'],
            'latin': ['latin', 'reggaeton'],
            'reggae': ['reggae'],
            'bass music': ['dubstep', 'drum-and-bass'],
            'house': ['house', 'deep-house'],
            'techno': ['techno'],
            'trance': ['trance'],
            'vocaloid': ['j-pop'],
            'gaming': ['electronic'],
            'disco': ['disco'],
            'indie': ['indie', 'indie-pop'],
            'shoegaze': ['shoegaze', 'indie'],
            'post-rock': ['post-rock'],
            'phonk': ['hip-hop'],
            'city pop': ['j-pop'],
            'soul': ['soul'],
        };

        const mappedGenres = new Set<string>();

        for (const genre of detectedGenres) {
            const mapped = genreMapping[genre.toLowerCase()];
            if (mapped) {
                for (const g of mapped) {
                    if (availableSeeds.includes(g)) {
                        mappedGenres.add(g);
                    }
                }
            } else {
                const normalized = genre.toLowerCase().replace(/\s+/g, '-');
                if (availableSeeds.includes(normalized)) {
                    mappedGenres.add(normalized);
                }
            }
        }

        return [...mappedGenres];
    }

    // ── SMART RECOMMENDATIONS ────────────────────────────────────────

    /**
     * Get genre-aware recommendations for autoplay.
     * Main entry point for AutoPlayService.
     * 
     * Strategy:
     * 1. Find the current track on Spotify (by title + artist)
     * 2. Get its audio features (energy, valence, mood)
     * 3. Get artist genres
     * 4. Use all of this as seeds + tuning for recommendations
     * 5. Maintains genre/mood consistency (chill → chill, energetic → energetic)
     */
    async getSmartRecommendations(
        trackTitle: string,
        trackArtist: string,
        recentGenres: string[],
        limit: number = 10,
    ): Promise<SpotifyTrack[]> {
        if (!this.isConfigured()) return [];

        try {
            const spotifyTrack = await this.findTrack(trackTitle, trackArtist);
            
            const seedTracks: string[] = [];
            const seedArtists: string[] = [];
            let targetEnergy: number | undefined;
            let targetValence: number | undefined;
            let targetDanceability: number | undefined;
            let targetTempo: number | undefined;
            let minEnergy: number | undefined;
            let maxEnergy: number | undefined;

            if (spotifyTrack) {
                seedTracks.push(spotifyTrack.id);

                if (spotifyTrack.artists[0]) {
                    seedArtists.push(spotifyTrack.artists[0].id);
                }

                // Get audio features for mood matching
                const features = await this.getAudioFeatures(spotifyTrack.id);
                if (features) {
                    const moodProfile = this.deriveMoodProfile(features);
                    
                    targetEnergy = features.energy;
                    targetValence = features.valence;
                    targetDanceability = features.danceability;
                    targetTempo = features.tempo;
                    
                    // Constrain energy to prevent wild genre jumps (chill ↛ metal)
                    minEnergy = Math.max(0, features.energy - 0.2);
                    maxEnergy = Math.min(1, features.energy + 0.2);

                    logger.info('Spotify', `Mood: ${moodProfile.mood} (energy=${features.energy.toFixed(2)}, valence=${features.valence.toFixed(2)}, tempo=${features.tempo.toFixed(0)}bpm)`);
                }

                // Get artist genres for genre seeding
                if (spotifyTrack.artists[0]) {
                    const genres = await this.getArtistGenres(spotifyTrack.artists[0].id);
                    if (genres.length > 0) {
                        logger.info('Spotify', `Artist genres: ${genres.slice(0, 5).join(', ')}`);
                    }
                }
            }

            // Map detected genres to Spotify seed genres
            const spotifyGenres = await this.mapToSpotifyGenres(recentGenres);

            const recommendations = await this.getRecommendations({
                seedTracks: seedTracks.length > 0 ? seedTracks : undefined,
                seedArtists: seedArtists.length > 0 ? seedArtists : undefined,
                seedGenres: spotifyGenres.length > 0 ? spotifyGenres.slice(0, 3) : undefined,
                targetEnergy,
                targetValence,
                targetDanceability,
                targetTempo,
                minEnergy,
                maxEnergy,
                limit,
            });

            if (recommendations.length > 0) {
                logger.info('Spotify', `Smart recommendations: ${recommendations.length} tracks (genres: ${spotifyGenres.join(', ') || 'auto'})`);
            }

            return recommendations;
        } catch (error) {
            logger.error('Spotify', `Smart recommendations error: ${(error as Error).message}`);
            return [];
        }
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

    /** Clear expired cache entries */
    cleanup(): void {
        const now = Date.now();
        
        for (const [key, value] of this.artistGenreCache) {
            if (now > value.expiresAt) this.artistGenreCache.delete(key);
        }
        
        for (const [key, value] of this.audioFeaturesCache) {
            if (now > value.expiresAt) this.audioFeaturesCache.delete(key);
        }
    }

    /** Shutdown — clear all caches */
    shutdown(): void {
        this.token = null;
        this.artistGenreCache.clear();
        this.audioFeaturesCache.clear();
        this.genreSeedsCache = [];
        logger.info('Spotify', 'Service shut down');
    }
}

// Singleton export
const spotifyService = new SpotifyService();
export { SpotifyService };
export default spotifyService;
