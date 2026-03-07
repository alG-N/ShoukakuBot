import lavalinkService from '../core/LavalinkService.js';
import { queueService } from '../queue/index.js';
import logger from '../../../core/Logger.js';
import type { MusicTrack, TrackInfo } from '../events/MusicEvents.js';
import type { SearchStrategy, GenrePattern, ListeningProfile } from '../../../types/music/autoplay.js';

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

const LANGUAGE_PATTERNS: { pattern: RegExp; lang: string }[] = [
    { pattern: /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/, lang: 'japanese' },
    { pattern: /[\uAC00-\uD7AF]/, lang: 'korean' },
    { pattern: /[\u0E00-\u0E7F]/, lang: 'thai' },
    { pattern: /[\u0400-\u04FF]/, lang: 'russian' },
    { pattern: /[\u0600-\u06FF]/, lang: 'arabic' },
    { pattern: /[áéíóúñ¿¡ü]/i, lang: 'spanish' },
    { pattern: /[àâçéèêëïîôùûü]/i, lang: 'french' },
];

const ARTIST_GRAPH: Record<string, string[]> = {
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

class AutoPlayService {
    private readonly MIN_SEARCH_INTERVAL = 3000;
    private readonly MAX_STRATEGIES = 8;

    private lastMoodProfile: string | null = null;

    private recentAutoplayArtists = new Map<string, string[]>();
    private readonly MAX_RECENT_ARTISTS = 12;

    async findSimilarTrack(guildId: string, lastTrack: MusicTrack): Promise<MusicTrack | null> {
        const queue = queueService.get(guildId);
        const now = Date.now();

        if (queue?.lastAutoplaySearch && (now - queue.lastAutoplaySearch) < this.MIN_SEARCH_INTERVAL) {
            logger.info('AutoPlay', 'Rate limited, skipping search');
            return null;
        }
        if (queue) queue.lastAutoplaySearch = now;

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

        if (author) {
            this._trackRecentArtist(guildId, this._cleanAuthor(author));
        }

        const profile = this._buildListeningProfile(recentTitles, title, author || '');

        const cleanTitle = this._cleanTitle(title);
        const cleanAuthor = this._cleanAuthor(author || '');
        const genreKeywords = this._extractGenreKeywords(title + ' ' + (author || ''));

        const strategies = this._buildSmartStrategies(cleanTitle, cleanAuthor, genreKeywords, uri, profile);

        const sortedStrategies = strategies.sort((a, b) => b.weight - a.weight);
        const selectedStrategies = this._diversifyStrategies(sortedStrategies, this.MAX_STRATEGIES);

        logger.info('AutoPlay', `Using ${selectedStrategies.length} strategies: ${selectedStrategies.map(s => s.name).join(', ')}`);

        for (const strategy of selectedStrategies) {
            try {
                logger.info('AutoPlay', `Trying: ${strategy.name} (w=${strategy.weight}) — "${strategy.query}"`);

                const results = await this._searchWithLimit(strategy.query, 8);

                if (results && results.length > 0) {
                    const validTracks = this._filterRecentTracks(results, recentTitles, title);

                    if (validTracks.length > 0) {
                        const selected = this._scoredSelect(validTracks, cleanAuthor, genreKeywords, profile);
                        logger.info('AutoPlay', `Selected: ${selected.info?.title ?? 'Unknown'} (strategy: ${strategy.name})`);
                        return selected;
                    }
                }
            } catch {
                continue;
            }
        }

        return this._smartFallback(cleanAuthor, genreKeywords, recentTitles, title, profile);
    }

    private _buildListeningProfile(recentTitles: string[], currentTitle: string, currentAuthor: string): ListeningProfile {
        const genres = new Map<string, number>();
        const artists = new Map<string, number>();
        let language = 'unknown';

        const allTitles = [...recentTitles, currentTitle];
        
        for (const title of allTitles) {
            const detected = this._extractGenreKeywords(title);
            for (const genre of detected) {
                genres.set(genre, (genres.get(genre) || 0) + 1);
            }

            for (const { pattern, lang } of LANGUAGE_PATTERNS) {
                if (pattern.test(title)) {
                    language = lang;
                }
            }
        }

        if (currentAuthor) {
            const clean = this._cleanAuthor(currentAuthor).toLowerCase();
            artists.set(clean, (artists.get(clean) || 0) + 3);
        }

        const mood = this._detectMood(genres);

        return { genres, artists, mood, avgDuration: 0, language };
    }

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

    getLastMoodProfile(): string | null {
        return this.lastMoodProfile;
    }

    private _buildSmartStrategies(
        cleanTitle: string, cleanAuthor: string, genres: string[], uri?: string, profile?: ListeningProfile
    ): SearchStrategy[] {
        const strategies: SearchStrategy[] = [];

        if (cleanAuthor && cleanAuthor.length > 2) {
            const guildId = this._currentGuildId;
            const isRecentAuthor = guildId && this._isRecentArtist(guildId, cleanAuthor);

            const authorKey = cleanAuthor.toLowerCase();
            const similarArtists = this._findSimilarArtists(authorKey);

            if (isRecentAuthor && similarArtists.length > 0) {
                const shuffled = similarArtists.sort(() => Math.random() - 0.5).slice(0, 4);
                for (let i = 0; i < shuffled.length; i++) {
                    strategies.push(
                        { name: `switch_artist_${shuffled[i]}`, query: `${shuffled[i]} popular songs`, weight: 100 - i * 3, category: 'related' }
                    );
                }
                strategies.push(
                    { name: 'artist_similar_songs', query: `${cleanAuthor}`, weight: 30, category: 'artist' },
                );
            } else if (isRecentAuthor && similarArtists.length === 0) {
                strategies.push(
                    { name: 'artist_similar_songs', query: `${cleanAuthor}`, weight: 30, category: 'artist' },
                );
                strategies.push(
                    { name: 'similar_to_artist', query: `artists similar to ${cleanAuthor}`, weight: 95, category: 'related' },
                    { name: 'fans_also_like', query: `if you like ${cleanAuthor}`, weight: 90, category: 'related' },
                    { name: 'discover_related', query: `${cleanAuthor} type music`, weight: 85, category: 'related' },
                );
            } else {
                strategies.push(
                    { name: 'artist_similar_songs', query: `${cleanAuthor}`, weight: 80, category: 'artist' },
                    { name: 'artist_popular', query: `${cleanAuthor} popular`, weight: 70, category: 'artist' },
                );

                if (similarArtists.length > 0) {
                    const shuffled = similarArtists.sort(() => Math.random() - 0.5).slice(0, 3);
                    for (const artist of shuffled) {
                        strategies.push(
                            { name: `related_artist_${artist}`, query: `${artist} popular songs`, weight: 92, category: 'related' }
                        );
                    }
                } else {
                    strategies.push(
                        { name: 'discover_via_current', query: `if you like ${cleanAuthor}`, weight: 88, category: 'related' },
                    );
                }
            }

            if (genres.length > 0) {
                const primaryGenre = genres[0];
                strategies.push(
                    { name: 'artist_genre_cross', query: `${cleanAuthor} ${primaryGenre}`, weight: 75, category: 'artist' }
                );
            }
        }

        if (cleanTitle && cleanTitle.length > 3) {
            const titleWords = cleanTitle.split(' ').filter(w => w.length > 2);

            strategies.push(
                { name: 'songs_like', query: `songs like ${cleanTitle} ${cleanAuthor}`.trim(), weight: 88, category: 'related' }
            );

            if (titleWords.length >= 2) {
                strategies.push(
                    { name: 'title_context', query: `${titleWords.slice(0, 2).join(' ')} ${cleanAuthor}`.trim(), weight: 75, category: 'related' }
                );
            }
        }

        if (genres.length > 0) {
            const primaryGenre = genres[0];

            if (cleanAuthor) {
                strategies.push(
                    { name: 'genre_artist_mix', query: `best ${primaryGenre} like ${cleanAuthor}`, weight: 78, category: 'genre' }
                );
            }

            strategies.push(
                { name: 'genre_top', query: `best ${primaryGenre} songs`, weight: 72, category: 'genre' },
            );

            const relatedGenres = this._getRelatedGenres(primaryGenre);
            if (relatedGenres.length > 0) {
                const relatedGenre = relatedGenres[Math.floor(Math.random() * relatedGenres.length)];
                strategies.push(
                    { name: 'cross_genre', query: `${relatedGenre} ${primaryGenre} mix`, weight: 60, category: 'discovery' }
                );
            }
        }

        if (profile) {
            const topGenre = this._getTopFromMap(profile.genres);
            if (topGenre && !genres.includes(topGenre)) {
                strategies.push(
                    { name: 'profile_genre', query: `${topGenre} playlist`, weight: 65, category: 'context' }
                );
            }

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

        if (uri && uri.includes('youtube')) {
            const videoId = this._extractYouTubeId(uri);
            if (videoId) {
                strategies.push(
                    { name: 'yt_radio', query: `${cleanAuthor} ${cleanTitle.split(' ')[0]} radio`, weight: 82, category: 'related' }
                );
            }
        }

        if (Math.random() < 0.15) {
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

    private _diversifyStrategies(sorted: SearchStrategy[], max: number): SearchStrategy[] {
        const result: SearchStrategy[] = [];
        const categoryCount = new Map<string, number>();
        const maxPerCategory = 3;

        for (const strategy of sorted) {
            if (result.length >= max) break;
            const count = categoryCount.get(strategy.category) || 0;
            if (count < maxPerCategory) {
                result.push(strategy);
                categoryCount.set(strategy.category, count + 1);
            }
        }

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


    private _scoredSelect(tracks: MusicTrack[], author: string, genres: string[], profile: ListeningProfile): MusicTrack {
        if (tracks.length === 1) return tracks[0]!;

        const guildId = this._currentGuildId;

        const scored = tracks.map(track => {
            let score = 0;
            const trackTitle = (track.info?.title || '').toLowerCase();
            const trackAuthor = (track.info?.author || '').toLowerCase();
            const cleanTrackAuthor = this._cleanAuthor(trackAuthor);

            const isSameArtist = author && cleanTrackAuthor.includes(author.toLowerCase().substring(0, 10));
            const isRecentArtist = guildId && this._isRecentArtist(guildId, cleanTrackAuthor);

            if (isSameArtist) {
                score -= 25;
            } else if (isRecentArtist) {
                score -= 12;
            } else {
                score += 18;
            }

            const authorKey = author.toLowerCase();
            const similarArtists = this._findSimilarArtists(authorKey);
            if (similarArtists.some(a => cleanTrackAuthor.includes(a.substring(0, 8)))) {
                score += 8;
            }

            for (const genre of genres) {
                if (trackTitle.includes(genre.toLowerCase())) {
                    score += 3;
                }
            }

            for (const [genre, count] of profile.genres) {
                if (trackTitle.includes(genre.toLowerCase()) || trackAuthor.includes(genre.toLowerCase())) {
                    score += Math.min(count, 3);
                }
            }

            if (profile.language !== 'unknown') {
                for (const { pattern, lang } of LANGUAGE_PATTERNS) {
                    if (lang === profile.language && pattern.test(track.info?.title || '')) {
                        score += 4;
                    }
                }
            }

            if (/top\s?\d+|best\s?of|compilation|greatest\s?hits/i.test(trackTitle)) {
                score -= 3;
            }

            if (/\b(mix|playlist|compilation|medley|mashup|megamix|nonstop)\b/i.test(trackTitle)) {
                score -= 4;
            }

            const lengthSec = (track as any).lengthSeconds;
            const lengthMs = (track.info as any)?.length;
            const durSec = lengthSec || (lengthMs ? Math.floor(lengthMs / 1000) : 0);
            if (durSec > 0) {
                if (durSec >= 120 && durSec <= 360) score += 4;
                else if (durSec > 360 && durSec <= 480) score += 1;
                else if (durSec > 480) score -= 6;
                else if (durSec < 60) score -= 3;
            }

            score += Math.random() * 5;

            return { track, score, isSameArtist: !!isSameArtist };
        });

        scored.sort((a, b) => b.score - a.score);

        // Prefer a different artist when top score still repeats the same artist.
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

        const top = scored.slice(0, Math.min(4, scored.length));
        const totalScore = top.reduce((sum, t) => sum + Math.max(t.score, 1), 0);
        
        let random = Math.random() * totalScore;
        for (const entry of top) {
            random -= Math.max(entry.score, 1);
            if (random <= 0) {
                if (guildId) {
                    const pickedAuthor = this._cleanAuthor(entry.track.info?.author || '');
                    if (pickedAuthor) this._trackRecentArtist(guildId, pickedAuthor);
                }
                return entry.track;
            }
        }

        return top[0]!.track;
    }

    private _currentGuildId: string | undefined;

    private _trackRecentArtist(guildId: string, artist: string): void {
        if (!artist || artist.length < 2) return;

        let recent = this.recentAutoplayArtists.get(guildId);
        if (!recent) {
            recent = [];
            this.recentAutoplayArtists.set(guildId, recent);
        }

        const cleanArtist = artist.toLowerCase().trim();
        const last = recent[recent.length - 1];
        if (last && last.toLowerCase() === cleanArtist) return;

        recent.push(artist);

        while (recent.length > this.MAX_RECENT_ARTISTS) {
            recent.shift();
        }
    }

    private _isRecentArtist(guildId: string, artist: string): boolean {
        const recent = this.recentAutoplayArtists.get(guildId);
        if (!recent || !artist) return false;

        const cleanArtist = artist.toLowerCase().trim();
        return recent.some(a =>
            a.toLowerCase().includes(cleanArtist.substring(0, 10)) ||
            cleanArtist.includes(a.toLowerCase().substring(0, 10))
        );
    }

    private _findSimilarArtists(authorKey: string): string[] {
        const direct = ARTIST_GRAPH[authorKey];
        if (direct) return direct;

        for (const [knownArtist, related] of Object.entries(ARTIST_GRAPH)) {
            if (authorKey.includes(knownArtist) || knownArtist.includes(authorKey)) {
                return related;
            }
        }

        return [];
    }

    private _getRelatedGenres(genre: string): string[] {
        const found = GENRE_PATTERNS.find(g => g.genre === genre);
        return found?.related || [];
    }

    private _getTopFromMap(map: Map<string, number>): string | null {
        let top: string | null = null;
        let max = 0;
        for (const [key, count] of map) {
            if (count > max) { max = count; top = key; }
        }
        return top;
    }

    private _extractYouTubeId(uri: string): string | null {
        const match = uri.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
        return match?.[1] || null;
    }


    private async _smartFallback(
        cleanAuthor: string, genres: string[], recentTitles: string[], currentTitle: string, profile: ListeningProfile
    ): Promise<MusicTrack | null> {
        const fallbackQueries: string[] = [];

        if (genres.length > 0) {
            fallbackQueries.push(`${genres[0]} playlist`);
            const related = this._getRelatedGenres(genres[0]);
            if (related.length > 0) {
                fallbackQueries.push(`${related[0]} music`);
            }
        }

        if (cleanAuthor) {
            const similar = this._findSimilarArtists(cleanAuthor.toLowerCase());
            if (similar.length > 0) {
                fallbackQueries.push(`${similar[0]}`);
            } else {
                fallbackQueries.push(`best ${cleanAuthor.split(' ')[0]} songs`);
            }
        }

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

        fallbackQueries.push('trending music', 'popular songs');

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

    private _extractGenreKeywords(text: string): string[] {
        const keywords: string[] = [];

        for (const { pattern, genre } of GENRE_PATTERNS) {
            if (pattern.test(text)) {
                keywords.push(genre);
            }
        }

        return [...new Set(keywords)];
    }

    private async _searchWithLimit(query: string, limit: number = 12): Promise<MusicTrack[]> {
        try {
            const results = await (lavalinkService as { searchMultiple?: (q: string, l: number, preferredPlatform?: string) => Promise<MusicTrack[]> }).searchMultiple?.(query, limit, 'ytmsearch');
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

    private _filterRecentTracks(results: MusicTrack[], recentTitles: string[], currentTitle: string): MusicTrack[] {
        const lowerCurrentTitle = currentTitle.toLowerCase();

        return results.filter(result => {
            const trackTitle = result.info?.title || '';
            const lowerTitle = trackTitle.toLowerCase();

            if (lowerTitle === lowerCurrentTitle) return false;

            const currentWords = lowerCurrentTitle.split(/\s+/).filter(w => w.length > 2);
            const titleWords = lowerTitle.split(/\s+/).filter(w => w.length > 2);
            if (currentWords.length >= 3 && titleWords.length >= 3) {
                const overlap = currentWords.filter(w => titleWords.includes(w)).length;
                if (overlap / Math.min(currentWords.length, titleWords.length) >= 0.7) return false;
            }

            const isDuplicate = recentTitles.some(t => {
                const lt = t.toLowerCase();
                const minLen = Math.min(lt.length, lowerTitle.length, 25);
                return lt.substring(0, minLen) === lowerTitle.substring(0, minLen) ||
                       lt.includes(lowerTitle.substring(0, 20)) ||
                       lowerTitle.includes(lt.substring(0, 20));
            });
            if (isDuplicate) return false;

            if (result.info && 'isStream' in result.info && result.info.isStream) return false;

            if (/\b(podcast|interview|reaction|commentary|talk\s?show|discussion|review|unboxing|q\s?&\s?a|episode\s?\d|ep\s?\d|vlog|explained|tutorial|lecture|audiobook)\b/i.test(trackTitle)) {
                return false;
            }

            const lengthSec = (result as any).lengthSeconds;
            const lengthMs = (result.info as any)?.length;
            const durationSeconds = lengthSec || (lengthMs ? Math.floor(lengthMs / 1000) : 0);
            if (durationSeconds > 720) return false;

            return true;
        });
    }
}

const autoPlayService = new AutoPlayService();

export { AutoPlayService };
export default autoPlayService;

