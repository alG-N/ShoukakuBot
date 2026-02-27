/**
 * Auto-Play Service — Smart YouTube Recommendations
 * Intelligent track recommendations using YouTube search with multi-strategy
 * approach: artist graph, genre patterns, mood profiling, and language detection.
 * Spotify is only used for link resolution and embed scraping (not recommendations).
 * @module services/music/autoplay/AutoPlayService
 */

import lavalinkService from '../core/LavalinkService.js';
import { queueService } from '../queue/index.js';
import logger from '../../../core/Logger.js';
import type { MusicTrack, TrackInfo } from '../events/MusicEvents.js';

// TYPES

interface SearchStrategy {
    name: string;
    query: string;
    /** Higher weight = higher priority (tried first) */
    weight: number;
    /** Strategy category for diversity */
    category: 'artist' | 'genre' | 'mood' | 'discovery' | 'related' | 'context';
}

interface GenrePattern {
    pattern: RegExp;
    genre: string;
    /** Related genres for cross-recommendations */
    related: string[];
}

interface ListeningProfile {
    /** Top genres detected from history */
    genres: Map<string, number>;
    /** Top artists from history */
    artists: Map<string, number>;
    /** Detected mood/energy (chill, energetic, mixed) */
    mood: string;
    /** Average track duration in seconds */
    avgDuration: number;
    /** Language hints */
    language: string;
}

// Expanded genre patterns with related genres for cross-recommendations
const GENRE_PATTERNS: GenrePattern[] = [
    { pattern: /\b(lofi|lo-fi|lo fi)\b/i, genre: 'lofi', related: ['chill', 'jazz', 'instrumental', 'ambient'] },
    { pattern: /\b(edm|electronic|electro)\b/i, genre: 'edm', related: ['house', 'bass music', 'trance', 'techno'] },
    { pattern: /\b(rock|alt[\s-]?rock|indie[\s-]?rock)\b/i, genre: 'rock', related: ['alternative', 'indie', 'grunge'] },
    { pattern: /\b(metal|heavy\s?metal|death\s?metal|black\s?metal)\b/i, genre: 'metal', related: ['rock', 'hardcore', 'progressive'] },
    { pattern: /\b(punk|pop[\s-]?punk|skate[\s-]?punk)\b/i, genre: 'punk', related: ['rock', 'alternative', 'hardcore'] },
    { pattern: /\b(jazz|smooth\s?jazz|nu[\s-]?jazz)\b/i, genre: 'jazz', related: ['lofi', 'r&b', 'soul', 'instrumental'] },
    { pattern: /\b(blues)\b/i, genre: 'blues', related: ['jazz', 'rock', 'soul', 'country'] },
    { pattern: /\b(hip\s?hop|rap)\b/i, genre: 'hip hop', related: ['r&b', 'trap', 'pop'] },
    { pattern: /\b(trap)\b/i, genre: 'trap', related: ['hip hop', 'edm', 'bass music'] },
    { pattern: /\b(k-?pop|korean)\b/i, genre: 'kpop', related: ['pop', 'jpop', 'edm'] },
    { pattern: /\b(j-?pop|japanese|jpop)\b/i, genre: 'jpop', related: ['anime', 'kpop', 'pop', 'vocaloid'] },
    { pattern: /\b(c-?pop|chinese|cpop|mandopop)\b/i, genre: 'cpop', related: ['pop', 'kpop', 'jpop'] },
    { pattern: /\b(pop)\b/i, genre: 'pop', related: ['kpop', 'jpop', 'edm', 'r&b'] },
    { pattern: /\b(anime|ost|soundtrack|opening|ending)\b/i, genre: 'anime', related: ['jpop', 'vocaloid', 'instrumental', 'orchestral'] },
    { pattern: /\b(nightcore)\b/i, genre: 'nightcore', related: ['edm', 'anime', 'trance'] },
    { pattern: /\b(remix|bootleg|mashup)\b/i, genre: 'remix', related: ['edm', 'house', 'pop'] },
    { pattern: /\b(acoustic|unplugged)\b/i, genre: 'acoustic', related: ['folk', 'indie', 'singer-songwriter'] },
    { pattern: /\b(piano|instrumental)\b/i, genre: 'instrumental', related: ['classical', 'lofi', 'ambient', 'jazz'] },
    { pattern: /\b(chill|relaxing|calm|ambient)\b/i, genre: 'chill', related: ['lofi', 'ambient', 'instrumental', 'jazz'] },
    { pattern: /\b(classical|orchestra|symphon)/i, genre: 'classical', related: ['instrumental', 'orchestral', 'ambient'] },
    { pattern: /\b(r&b|rnb|soul|neo[\s-]?soul)\b/i, genre: 'r&b', related: ['hip hop', 'jazz', 'pop', 'soul'] },
    { pattern: /\b(country|folk|bluegrass)\b/i, genre: 'country', related: ['folk', 'acoustic', 'blues', 'americana'] },
    { pattern: /\b(latin|reggaeton|salsa|bachata|cumbia)\b/i, genre: 'latin', related: ['pop', 'hip hop', 'reggae'] },
    { pattern: /\b(reggae|ska|dancehall)\b/i, genre: 'reggae', related: ['latin', 'hip hop', 'dub'] },
    { pattern: /\b(dubstep|bass|dnb|drum\s?and\s?bass|brostep)\b/i, genre: 'bass music', related: ['edm', 'house', 'trap'] },
    { pattern: /\b(house|deep\s?house|tech\s?house|future\s?house)\b/i, genre: 'house', related: ['edm', 'techno', 'disco'] },
    { pattern: /\b(techno|minimal|industrial)\b/i, genre: 'techno', related: ['house', 'edm', 'trance'] },
    { pattern: /\b(trance|psytrance|progressive\s?trance)\b/i, genre: 'trance', related: ['edm', 'house', 'nightcore'] },
    { pattern: /\b(vocaloid|hatsune|miku|kagamine|gumi)\b/i, genre: 'vocaloid', related: ['jpop', 'anime', 'edm'] },
    { pattern: /\b(game|gaming|video\s?game|8[\s-]?bit|chiptune)\b/i, genre: 'gaming', related: ['edm', 'instrumental', 'chiptune'] },
    { pattern: /\b(disco|funk|groove)\b/i, genre: 'disco', related: ['house', 'pop', 'r&b'] },
    { pattern: /\b(indie|alternative)\b/i, genre: 'indie', related: ['rock', 'folk', 'pop', 'shoegaze'] },
    { pattern: /\b(shoegaze|dream\s?pop|ethereal)\b/i, genre: 'shoegaze', related: ['indie', 'ambient', 'post-rock'] },
    { pattern: /\b(post[\s-]?rock|math[\s-]?rock)\b/i, genre: 'post-rock', related: ['rock', 'ambient', 'instrumental'] },
    { pattern: /\b(phonk|drift[\s-]?phonk)\b/i, genre: 'phonk', related: ['hip hop', 'trap', 'edm'] },
    { pattern: /\b(city\s?pop|シティ[\s-]?ポップ)\b/i, genre: 'city pop', related: ['jpop', 'disco', 'r&b', 'pop'] },
];

// Language detection patterns
const LANGUAGE_PATTERNS: { pattern: RegExp; lang: string }[] = [
    { pattern: /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/, lang: 'japanese' },
    { pattern: /[\uAC00-\uD7AF]/, lang: 'korean' },
    { pattern: /[\u0E00-\u0E7F]/, lang: 'thai' },
    { pattern: /[\u0400-\u04FF]/, lang: 'russian' },
    { pattern: /[\u0600-\u06FF]/, lang: 'arabic' },
    { pattern: /[áéíóúñ¿¡ü]/i, lang: 'spanish' },
    { pattern: /[àâçéèêëïîôùûü]/i, lang: 'french' },
];

// Known artist associations for better recommendations
const ARTIST_GRAPH: Record<string, string[]> = {
    // These are search-friendly terms, not exact artist names
    'yorushika': ['yoasobi', 'ado', 'kenshi yonezu', 'aimer', 'eve'],
    'yoasobi': ['yorushika', 'ado', 'kenshi yonezu', 'minami', 'eve'],
    'ado': ['yoasobi', 'yorushika', 'eve', 'kenshi yonezu', 'tuyu'],
    'kenshi yonezu': ['yoasobi', 'radwimps', 'back number', 'official hige dandism'],
    'radwimps': ['kenshi yonezu', 'back number', 'bump of chicken', 'mr. children'],
    'aimer': ['lisa', 'milet', 'yorushika', 'minami'],
    'lisa': ['aimer', 'milet', 'reona', 'asca'],
    'eve': ['yorushika', 'yoasobi', 'tuyu', 'ado'],
    'taylor swift': ['olivia rodrigo', 'billie eilish', 'ariana grande', 'dua lipa'],
    'billie eilish': ['olivia rodrigo', 'taylor swift', 'lana del rey', 'ariana grande'],
    'the weeknd': ['dua lipa', 'post malone', 'drake', 'travis scott'],
    'bts': ['stray kids', 'seventeen', 'txt', 'enhypen', 'blackpink'],
    'blackpink': ['twice', 'itzy', 'aespa', 'le sserafim', 'bts'],
    'twice': ['blackpink', 'itzy', 'red velvet', 'aespa', 'ive'],
};

// AUTO-PLAY SERVICE CLASS

class AutoPlayService {
    private readonly MIN_SEARCH_INTERVAL = 3000;
    private readonly HISTORY_SIZE = 30; // Track more history for better profiling
    private readonly MAX_STRATEGIES = 6;

    /** Last mood profile (derived from listening history) */
    private lastMoodProfile: string | null = null;

    /**
     * Recently auto-played artists per guild.
     * Used to enforce artist diversity — avoids playing the same artist back-to-back.
     * Map<guildId, artistName[]> (most recent last)
     */
    private recentAutoplayArtists = new Map<string, string[]>();
    private readonly MAX_RECENT_ARTISTS = 8; // Remember last N artists to avoid repeats

    /**
     * Find a similar track based on play history analysis.
     * Strategy: Spotify recommendations (genre/mood-aware) → YouTube search fallback.
     * 
     * Spotify flow:
     * 1. Find the current track on Spotify
     * 2. Get audio features (energy, valence, tempo)
     * 3. Use Spotify /recommendations with mood-matched tuning parameters
     * 4. Ensure genre consistency: chill → chill, energetic → energetic
     * 5. Search the recommended track on Lavalink for playback
     * 
     * If Spotify is unavailable or fails, falls back to the existing
     * YouTube-based strategy system (artist graph, genre patterns, etc.)
     */
    async findSimilarTrack(guildId: string, lastTrack: MusicTrack): Promise<MusicTrack | null> {
        const queue = queueService.get(guildId);
        const now = Date.now();

        // Rate limiting
        if (queue?.lastAutoplaySearch && (now - queue.lastAutoplaySearch) < this.MIN_SEARCH_INTERVAL) {
            logger.info('AutoPlay', 'Rate limited, skipping search');
            return null;
        }
        if (queue) queue.lastAutoplaySearch = now;

        // Store guildId for use in sub-methods
        this._currentGuildId = guildId;

        const trackInfo = lastTrack?.info || lastTrack;
        const title = trackInfo?.title;
        const author = trackInfo?.author;
        const uri = (trackInfo as TrackInfo)?.uri || lastTrack?.url;

        if (!title) {
            logger.info('AutoPlay', 'No track title available');
            return null;
        }

        const recentTitles = queue?.lastPlayedTracks || [];

        logger.info('AutoPlay', `Finding similar to: "${title}" by "${author}"`);

        // Track the current artist in recent artists list (for diversity)
        if (author) {
            this._trackRecentArtist(guildId, this._cleanAuthor(author));
        }

        // Build a listening profile from history
        const profile = this._buildListeningProfile(recentTitles, title, author || '');

        // Clean up title and author
        const cleanTitle = this._cleanTitle(title);
        const cleanAuthor = this._cleanAuthor(author || '');
        const genreKeywords = this._extractGenreKeywords(title + ' ' + (author || ''));

        // ── YOUTUBE STRATEGY ─────────────────────────────────────────
        // YouTube-based multi-strategy approach with artist graph,
        // genre patterns, mood profiling, and language detection.
        // (Spotify recommendations API returns 404 — deprecated.
        //  Spotify is only used for link resolution & embed scraping.)
        // Build weighted strategies based on profile
        const strategies = this._buildSmartStrategies(cleanTitle, cleanAuthor, genreKeywords, uri, profile);

        // Sort by weight (highest first) then take top N
        const sortedStrategies = strategies.sort((a, b) => b.weight - a.weight);
        
        // Ensure category diversity: pick top strategies but ensure variety
        const selectedStrategies = this._diversifyStrategies(sortedStrategies, this.MAX_STRATEGIES);

        logger.info('AutoPlay', `Using ${selectedStrategies.length} strategies: ${selectedStrategies.map(s => s.name).join(', ')}`);

        // Try strategies in order
        for (const strategy of selectedStrategies) {
            try {
                logger.info('AutoPlay', `Trying: ${strategy.name} (w=${strategy.weight}) — "${strategy.query}"`);

                const results = await this._searchWithLimit(strategy.query, 8);

                if (results && results.length > 0) {
                    const validTracks = this._filterRecentTracks(results, recentTitles, title);

                    if (validTracks.length > 0) {
                        // Smart selection: score results by relevance instead of pure random
                        const selected = this._scoredSelect(validTracks, cleanAuthor, genreKeywords, profile);
                        logger.info('AutoPlay', `Selected: ${selected.info?.title ?? 'Unknown'} (strategy: ${strategy.name})`);
                        return selected;
                    }
                }
            } catch {
                continue;
            }
        }

        // Fallback with profile awareness
        return this._smartFallback(cleanAuthor, genreKeywords, recentTitles, title, profile);
    }

    // ── LISTENING PROFILE ────────────────────────────────────────────

    /**
     * Analyze play history to build a listening profile
     */
    private _buildListeningProfile(recentTitles: string[], currentTitle: string, currentAuthor: string): ListeningProfile {
        const genres = new Map<string, number>();
        const artists = new Map<string, number>();
        let language = 'unknown';

        // Analyze current + recent tracks
        const allTitles = [...recentTitles, currentTitle];
        
        for (const title of allTitles) {
            // Extract genres with recency weighting (more recent = higher weight)
            const detected = this._extractGenreKeywords(title);
            for (const genre of detected) {
                genres.set(genre, (genres.get(genre) || 0) + 1);
            }

            // Detect language
            for (const { pattern, lang } of LANGUAGE_PATTERNS) {
                if (pattern.test(title)) {
                    language = lang;
                }
            }
        }

        // Current artist gets higher weight
        if (currentAuthor) {
            const clean = this._cleanAuthor(currentAuthor).toLowerCase();
            artists.set(clean, (artists.get(clean) || 0) + 3);
        }

        // Detect mood from genre distribution
        const mood = this._detectMood(genres);

        return { genres, artists, mood, avgDuration: 0, language };
    }

    /**
     * Detect overall mood from genre profile
     */
    private _detectMood(genres: Map<string, number>): string {
        const chillGenres = ['lofi', 'chill', 'ambient', 'jazz', 'acoustic', 'classical', 'instrumental'];
        const energeticGenres = ['edm', 'rock', 'metal', 'bass music', 'house', 'techno', 'trance', 'phonk', 'punk'];
        const emotionalGenres = ['r&b', 'soul', 'indie', 'shoegaze', 'post-rock'];

        let chillScore = 0;
        let energyScore = 0;
        let emotionalScore = 0;

        for (const [genre, count] of genres) {
            if (chillGenres.includes(genre)) chillScore += count;
            if (energeticGenres.includes(genre)) energyScore += count;
            if (emotionalGenres.includes(genre)) emotionalScore += count;
        }

        if (energyScore > chillScore && energyScore > emotionalScore) return 'energetic';
        if (chillScore > energyScore && chillScore > emotionalScore) return 'chill';
        if (emotionalScore > 0) return 'emotional';
        return 'mixed';
    }

    /**
     * Get the current mood profile (for display/debugging)
     */
    getLastMoodProfile(): string | null {
        return this.lastMoodProfile;
    }

    // ── SMART STRATEGY BUILDING ──────────────────────────────────────

    /**
     * Build weighted and categorized search strategies
     */
    private _buildSmartStrategies(
        cleanTitle: string, cleanAuthor: string, genres: string[], uri?: string, profile?: ListeningProfile
    ): SearchStrategy[] {
        const strategies: SearchStrategy[] = [];

        // ── ARTIST-BASED (with diversity awareness) ──────────────────
        if (cleanAuthor && cleanAuthor.length > 2) {
            const guildId = this._currentGuildId;
            const isRecentAuthor = guildId && this._isRecentArtist(guildId, cleanAuthor);

            // Check artist graph for known similar artists
            const authorKey = cleanAuthor.toLowerCase();
            const similarArtists = this._findSimilarArtists(authorKey);

            if (isRecentAuthor && similarArtists.length > 0) {
                // We've been playing this artist recently — prioritize switching!
                // Related artists get TOP priority instead of current artist
                const shuffled = similarArtists.sort(() => Math.random() - 0.5).slice(0, 3);
                for (let i = 0; i < shuffled.length; i++) {
                    strategies.push(
                        { name: `switch_artist_${shuffled[i]}`, query: `${shuffled[i]} popular`, weight: 100 - i * 5, category: 'related' }
                    );
                }
                // Current artist gets lower priority
                strategies.push(
                    { name: 'artist_similar_songs', query: `${cleanAuthor}`, weight: 60, category: 'artist' },
                );
            } else if (isRecentAuthor && similarArtists.length === 0) {
                // Recent artist but NOT in the artist graph — deprioritize direct artist search
                // to avoid looping the same artist. Boost "songs like" and genre strategies instead.
                strategies.push(
                    { name: 'artist_similar_songs', query: `${cleanAuthor}`, weight: 50, category: 'artist' },
                );
                // Boost broader discovery: "artists similar to X" via YouTube
                strategies.push(
                    { name: 'similar_to_artist', query: `artists similar to ${cleanAuthor}`, weight: 92, category: 'related' },
                    { name: 'fans_also_like', query: `${cleanAuthor} fans also like`, weight: 88, category: 'related' },
                );
            } else {
                // Fresh artist or no graph data — normal behavior
                strategies.push(
                    { name: 'artist_similar_songs', query: `${cleanAuthor}`, weight: 95, category: 'artist' },
                    { name: 'artist_popular', query: `${cleanAuthor} popular`, weight: 85, category: 'artist' },
                );

                if (similarArtists.length > 0) {
                    // Pick 2-3 random similar artists for diversity
                    const shuffled = similarArtists.sort(() => Math.random() - 0.5).slice(0, 3);
                    for (const artist of shuffled) {
                        strategies.push(
                            { name: `related_artist_${artist}`, query: `${artist} popular`, weight: 90, category: 'related' }
                        );
                    }
                }
            }

            // Artist + genre crossover
            if (genres.length > 0) {
                const primaryGenre = genres[0];
                strategies.push(
                    { name: 'artist_genre_cross', query: `${cleanAuthor} ${primaryGenre}`, weight: 75, category: 'artist' }
                );
            }
        }

        // RELATED CONTENT (YouTube-style)
        if (cleanTitle && cleanTitle.length > 3) {
            const titleWords = cleanTitle.split(' ').filter(w => w.length > 2);
            
            // "Songs like X" — YouTube's own recommendation signal
            strategies.push(
                { name: 'songs_like', query: `songs like ${cleanTitle} ${cleanAuthor}`.trim(), weight: 88, category: 'related' }
            );

            // Partial title match — catches cover versions, remixes, similar vibes
            if (titleWords.length >= 2) {
                strategies.push(
                    { name: 'title_context', query: `${titleWords.slice(0, 2).join(' ')} ${cleanAuthor}`.trim(), weight: 75, category: 'related' }
                );
            }
        }

        // ── GENRE-BASED ──────────────────────────────────────────────
        if (genres.length > 0) {
            const primaryGenre = genres[0];
            
            // Best of genre with artist context
            if (cleanAuthor) {
                strategies.push(
                    { name: 'genre_artist_mix', query: `best ${primaryGenre} like ${cleanAuthor}`, weight: 78, category: 'genre' }
                );
            }

            strategies.push(
                { name: 'genre_top', query: `best ${primaryGenre} songs`, weight: 72, category: 'genre' },
            );

            // Cross-genre: use related genres for discovery
            const relatedGenres = this._getRelatedGenres(primaryGenre);
            if (relatedGenres.length > 0) {
                const relatedGenre = relatedGenres[Math.floor(Math.random() * relatedGenres.length)];
                strategies.push(
                    { name: 'cross_genre', query: `${relatedGenre} ${primaryGenre} mix`, weight: 60, category: 'discovery' }
                );
            }
        }

        // ── PROFILE-BASED (history-aware) ────────────────────────────
        if (profile) {
            // If strong genre preference detected, lean into it
            const topGenre = this._getTopFromMap(profile.genres);
            if (topGenre && !genres.includes(topGenre)) {
                strategies.push(
                    { name: 'profile_genre', query: `${topGenre} playlist`, weight: 65, category: 'context' }
                );
            }

            // Language-aware search
            if (profile.language !== 'unknown') {
                const langLabels: Record<string, string> = {
                    japanese: 'japanese', korean: 'korean', thai: 'thai',
                    russian: 'russian', arabic: 'arabic', spanish: 'spanish', french: 'french'
                };
                const langLabel = langLabels[profile.language];
                if (langLabel) {
                    const genreCtx = genres[0] || 'music';
                    strategies.push(
                        { name: 'lang_context', query: `${langLabel} ${genreCtx}`, weight: 70, category: 'context' }
                    );
                }
            }

            // Mood-based with genre context
            const moodQueries: Record<string, string[]> = {
                chill: ['chill vibes playlist', 'relaxing music', 'late night chill'],
                energetic: ['hype music playlist', 'workout music', 'energetic hits'],
                emotional: ['emotional songs', 'melancholic playlist', 'sad beautiful songs'],
                mixed: ['music mix', 'top songs'],
            };
            const moods = moodQueries[profile.mood] || moodQueries.mixed;
            const randomMoodQuery = moods[Math.floor(Math.random() * moods.length)]!;
            strategies.push(
                { name: 'mood_context', query: randomMoodQuery, weight: 50, category: 'mood' }
            );
        }

        // ── DISCOVERY (low weight, adds variety) ─────────────────────
        // YouTube Radio/Mix — leverages YouTube's own recommendation
        if (uri && uri.includes('youtube')) {
            const videoId = this._extractYouTubeId(uri);
            if (videoId) {
                strategies.push(
                    { name: 'yt_radio', query: `${cleanAuthor} ${cleanTitle.split(' ')[0]} radio`, weight: 82, category: 'related' }
                );
            }
        }

        // Serendipity: very occasionally suggest something completely different
        if (Math.random() < 0.15) { // 15% chance
            const serendipityQueries = [
                'underrated gems music', 'hidden gems playlist', 'deep cuts music',
                `${genres[0] || 'indie'} underground`, 'music discovery playlist'
            ];
            const serendipity = serendipityQueries[Math.floor(Math.random() * serendipityQueries.length)]!;
            strategies.push(
                { name: 'serendipity', query: serendipity, weight: 30, category: 'discovery' }
            );
        }

        return strategies;
    }

    /**
     * Ensure strategy diversity — pick from different categories
     */
    private _diversifyStrategies(sorted: SearchStrategy[], max: number): SearchStrategy[] {
        const result: SearchStrategy[] = [];
        const categoryCount = new Map<string, number>();
        const maxPerCategory = 2;

        for (const strategy of sorted) {
            if (result.length >= max) break;
            const count = categoryCount.get(strategy.category) || 0;
            if (count < maxPerCategory) {
                result.push(strategy);
                categoryCount.set(strategy.category, count + 1);
            }
        }

        // Fill remaining with any leftover high-weight strategies
        if (result.length < max) {
            for (const strategy of sorted) {
                if (result.length >= max) break;
                if (!result.includes(strategy)) {
                    result.push(strategy);
                }
            }
        }

        return result;
    }

    // ── SMART SELECTION ──────────────────────────────────────────────

    /**
     * Score and select from results based on relevance signals.
     * Prioritizes artist diversity: different artists get a big boost,
     * same/recent artists get penalized.
     */
    private _scoredSelect(tracks: MusicTrack[], author: string, genres: string[], profile: ListeningProfile): MusicTrack {
        if (tracks.length === 1) return tracks[0]!;

        const guildId = this._currentGuildId;

        const scored = tracks.map(track => {
            let score = 0;
            const trackTitle = (track.info?.title || '').toLowerCase();
            const trackAuthor = (track.info?.author || '').toLowerCase();
            const cleanTrackAuthor = this._cleanAuthor(trackAuthor);

            // ── ARTIST DIVERSITY (most important signal) ─────────
            const isSameArtist = author && cleanTrackAuthor.includes(author.toLowerCase().substring(0, 10));
            const isRecentArtist = guildId && this._isRecentArtist(guildId, cleanTrackAuthor);

            if (isSameArtist) {
                // Same artist as current track — heavy penalty to encourage switching
                score -= 15;
            } else if (isRecentArtist) {
                // Recently played artist — moderate penalty
                score -= 6;
            } else {
                // Fresh artist — big bonus!
                score += 12;
            }

            // Similar artists from graph — bonus (they're different but related)
            const authorKey = author.toLowerCase();
            const similarArtists = this._findSimilarArtists(authorKey);
            if (similarArtists.some(a => cleanTrackAuthor.includes(a.substring(0, 8)))) {
                score += 8; // Known similar artist — high bonus (different artist, same vibe)
            }

            // Genre match bonus
            for (const genre of genres) {
                if (trackTitle.includes(genre.toLowerCase())) {
                    score += 3;
                }
            }

            // Profile genre match
            for (const [genre, count] of profile.genres) {
                if (trackTitle.includes(genre.toLowerCase()) || trackAuthor.includes(genre.toLowerCase())) {
                    score += Math.min(count, 3);
                }
            }

            // Language match bonus
            if (profile.language !== 'unknown') {
                for (const { pattern, lang } of LANGUAGE_PATTERNS) {
                    if (lang === profile.language && pattern.test(track.info?.title || '')) {
                        score += 4;
                    }
                }
            }

            // Penalize generic/compilation tracks
            if (/top\s?\d+|best\s?of|compilation|greatest\s?hits/i.test(trackTitle)) {
                score -= 3;
            }

            // Add random factor to prevent deterministic loops
            score += Math.random() * 5;

            return { track, score, isSameArtist: !!isSameArtist };
        });

        // Sort by score descending
        scored.sort((a, b) => b.score - a.score);

        // Hard diversity guard: if the top pick is same-artist, prefer any different-artist result
        const topPick = scored[0]!;
        if (topPick.isSameArtist) {
            const differentArtist = scored.find(s => !s.isSameArtist);
            if (differentArtist) {
                logger.info('AutoPlay', `Diversity override: skipping same-artist "${topPick.track.info?.author}" → "${differentArtist.track.info?.author}"`);
                if (guildId) {
                    const pickedAuthor = this._cleanAuthor(differentArtist.track.info?.author || '');
                    if (pickedAuthor) this._trackRecentArtist(guildId, pickedAuthor);
                }
                return differentArtist.track;
            }
        }

        // Pick from top 4 with weighted probability
        const top = scored.slice(0, Math.min(4, scored.length));
        const totalScore = top.reduce((sum, t) => sum + Math.max(t.score, 1), 0);
        
        let random = Math.random() * totalScore;
        for (const entry of top) {
            random -= Math.max(entry.score, 1);
            if (random <= 0) {
                // Track picked artist for diversity
                if (guildId) {
                    const pickedAuthor = this._cleanAuthor(entry.track.info?.author || '');
                    if (pickedAuthor) this._trackRecentArtist(guildId, pickedAuthor);
                }
                return entry.track;
            }
        }

        return top[0]!.track;
    }

    // ── ARTIST GRAPH ─────────────────────────────────────────────────

    /** Store the current guildId during findSimilarTrack execution */
    private _currentGuildId: string | undefined;

    // ── ARTIST DIVERSITY TRACKING ────────────────────────────────────

    /**
     * Track a recently auto-played artist for a guild.
     * Maintains a sliding window of recent artists to avoid repetition.
     */
    private _trackRecentArtist(guildId: string, artist: string): void {
        if (!artist || artist.length < 2) return;

        let recent = this.recentAutoplayArtists.get(guildId);
        if (!recent) {
            recent = [];
            this.recentAutoplayArtists.set(guildId, recent);
        }

        // Don't add duplicates at the end
        const cleanArtist = artist.toLowerCase().trim();
        const last = recent[recent.length - 1];
        if (last && last.toLowerCase() === cleanArtist) return;

        recent.push(artist);

        // Trim to max size
        while (recent.length > this.MAX_RECENT_ARTISTS) {
            recent.shift();
        }
    }

    /**
     * Check if an artist was recently auto-played in a guild
     */
    private _isRecentArtist(guildId: string, artist: string): boolean {
        const recent = this.recentAutoplayArtists.get(guildId);
        if (!recent || !artist) return false;

        const cleanArtist = artist.toLowerCase().trim();
        return recent.some(a =>
            a.toLowerCase().includes(cleanArtist.substring(0, 10)) ||
            cleanArtist.includes(a.toLowerCase().substring(0, 10))
        );
    }

    // ── ARTIST GRAPH ─────────────────────────────────────────────────

    /**
     * Find similar artists from the knowledge graph
     */
    private _findSimilarArtists(authorKey: string): string[] {
        // Direct lookup
        const direct = ARTIST_GRAPH[authorKey];
        if (direct) return direct;

        // Fuzzy lookup: check if authorKey is contained in or contains a known key
        for (const [knownArtist, related] of Object.entries(ARTIST_GRAPH)) {
            if (authorKey.includes(knownArtist) || knownArtist.includes(authorKey)) {
                return related;
            }
        }

        return [];
    }

    /**
     * Get related genres from the genre pattern definitions
     */
    private _getRelatedGenres(genre: string): string[] {
        const found = GENRE_PATTERNS.find(g => g.genre === genre);
        return found?.related || [];
    }

    /**
     * Get the highest-count item from a Map
     */
    private _getTopFromMap(map: Map<string, number>): string | null {
        let top: string | null = null;
        let max = 0;
        for (const [key, count] of map) {
            if (count > max) { max = count; top = key; }
        }
        return top;
    }

    /**
     * Extract YouTube video ID from URI
     */
    private _extractYouTubeId(uri: string): string | null {
        const match = uri.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
        return match?.[1] || null;
    }

    // ── SMART FALLBACK ───────────────────────────────────────────────

    /**
     * Profile-aware fallback when all strategies fail
     */
    private async _smartFallback(
        cleanAuthor: string, genres: string[], recentTitles: string[], currentTitle: string, profile: ListeningProfile
    ): Promise<MusicTrack | null> {
        const fallbackQueries: string[] = [];

        // Genre-aware fallback
        if (genres.length > 0) {
            fallbackQueries.push(`${genres[0]} playlist`);
            const related = this._getRelatedGenres(genres[0]);
            if (related.length > 0) {
                fallbackQueries.push(`${related[0]} music`);
            }
        }

        // Artist-aware fallback
        if (cleanAuthor) {
            const similar = this._findSimilarArtists(cleanAuthor.toLowerCase());
            if (similar.length > 0) {
                fallbackQueries.push(`${similar[0]}`);
            } else {
                fallbackQueries.push(`best ${cleanAuthor.split(' ')[0]} songs`);
            }
        }

        // Language-aware fallback
        if (profile.language !== 'unknown') {
            const langMap: Record<string, string> = {
                japanese: 'japanese music mix', korean: 'kpop playlist',
                spanish: 'spanish music hits', french: 'french pop',
                thai: 'thai music', russian: 'russian music', arabic: 'arabic music'
            };
            if (langMap[profile.language]) {
                fallbackQueries.push(langMap[profile.language]);
            }
        }

        // General fallbacks
        fallbackQueries.push('trending music', 'popular songs');

        // Try each fallback
        for (const query of fallbackQueries) {
            try {
                logger.info('AutoPlay', `Smart fallback: "${query}"`);
                const results = await this._searchWithLimit(query, 8);
                if (results && results.length > 0) {
                    const valid = this._filterRecentTracks(results, recentTitles, currentTitle);
                    if (valid.length > 0) {
                        const selected = this._scoredSelect(valid, cleanAuthor, genres, profile);
                        logger.info('AutoPlay', `Fallback selected: ${selected.info?.title ?? 'Unknown'}`);
                        return selected;
                    }
                }
            } catch {
                continue;
            }
        }

        logger.warn('AutoPlay', 'All strategies exhausted, no track found');
        return null;
    }

    // ── TITLE/AUTHOR CLEANING ────────────────────────────────────────

    private _cleanTitle(title: string): string {
        return title
            .replace(/\(official.*?\)/gi, '')
            .replace(/\[.*?\]/gi, '')
            .replace(/\|.*$/gi, '')
            .replace(/ft\.?.*$/gi, '')
            .replace(/feat\.?.*$/gi, '')
            .replace(/\(.*?remix.*?\)/gi, '')
            .replace(/\(.*?cover.*?\)/gi, '')
            .replace(/\(.*?version.*?\)/gi, '')
            .replace(/\(.*?edit.*?\)/gi, '')
            .replace(/-\s*(lyrics|audio|video|music\s*video|mv|pv)/gi, '')
            .replace(/\(lyrics?\)/gi, '')
            .replace(/\(full\s*(ver|version)?\)/gi, '')
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

    // ── GENRE EXTRACTION ─────────────────────────────────────────────

    private _extractGenreKeywords(text: string): string[] {
        const keywords: string[] = [];

        for (const { pattern, genre } of GENRE_PATTERNS) {
            if (pattern.test(text)) {
                keywords.push(genre);
            }
        }

        return [...new Set(keywords)]; // deduplicate
    }

    // ── SEARCH & FILTER ──────────────────────────────────────────────

    private async _searchWithLimit(query: string, limit: number = 8): Promise<MusicTrack[]> {
        try {
            const results = await (lavalinkService as { searchMultiple?: (q: string, l: number) => Promise<MusicTrack[]> }).searchMultiple?.(query, limit);
            if (results && results.length > 0) {
                return results;
            }

            const result = await lavalinkService.search(query, undefined);
            if (result?.track) {
                return [result as MusicTrack];
            }

            return [];
        } catch (error) {
            const err = error as Error;
            logger.error('AutoPlay', `Search error: ${err.message}`);
            return [];
        }
    }

    /**
     * Filter out recently played tracks (expanded history: 30 tracks)
     */
    private _filterRecentTracks(results: MusicTrack[], recentTitles: string[], currentTitle: string): MusicTrack[] {
        return results.filter(result => {
            const trackTitle = result.info?.title || '';
            const trackAuthor = result.info?.author || '';
            const lowerTitle = trackTitle.toLowerCase();

            // Exact title match
            if (lowerTitle === currentTitle.toLowerCase()) return false;

            // Fuzzy match against recent history (check both directions, longer substring)
            const isDuplicate = recentTitles.some(t => {
                const lt = t.toLowerCase();
                const minLen = Math.min(lt.length, lowerTitle.length, 25);
                return lt.substring(0, minLen) === lowerTitle.substring(0, minLen) ||
                       lt.includes(lowerTitle.substring(0, 20)) ||
                       lowerTitle.includes(lt.substring(0, 20));
            });
            if (isDuplicate) return false;

            // Filter out live streams and very long tracks (>30min)
            if (result.info && 'isStream' in result.info && result.info.isStream) return false;
            const length = (result as any).lengthSeconds || (result.info as any)?.length;
            if (length && length > 1800) return false;

            return true;
        });
    }
}

// Export singleton instance and class
const autoPlayService = new AutoPlayService();

export { AutoPlayService };
export default autoPlayService;
