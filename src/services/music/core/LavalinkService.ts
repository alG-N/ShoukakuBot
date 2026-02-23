/**
 * Lavalink Service
 * Low-level Lavalink connection management using Shoukaku
 * @module services/music/LavalinkService
 */

import { Shoukaku, Connectors } from 'shoukaku';
import type { Client } from 'discord.js';
import logger from '../../../core/Logger.js';
import * as lavalinkConfig from '../../../config/features/lavalink.js';
import circuitBreakerRegistry from '../../../core/CircuitBreakerRegistry.js';
import gracefulDegradation from '../../../core/GracefulDegradation.js';
import cacheService from '../../../cache/CacheService.js';
import { updateLavalinkMetrics } from '../../../core/metrics.js';
import type { MusicTrack } from '../events/MusicEvents.js';
import spotifyService from '../spotify/SpotifyService.js';
// TYPES
interface NodeConfig {
    name: string;
    url: string;
    auth: string;
    secure?: boolean;
}

interface SearchResult {
    track: unknown;
    encoded: string;
    url: string;
    title: string;
    lengthSeconds: number;
    thumbnail: string | null;
    author: string;
    requestedBy: unknown;
    source: string;
    viewCount: number | null;
    identifier: string | null;
    searchedByLink: boolean;
    originalQuery: string | null;
}

interface PlaylistResult {
    playlistName: string;
    tracks: SearchResult[];
}

interface PreservedState {
    timestamp: number;
    track: unknown;
    position: number;
    paused: boolean;
    volume: number;
}

interface NodeStatus {
    ready: boolean;
    activeConnections: number;
    error?: string;
    nodes?: Array<{
        name: string;
        state: number;
        stats: unknown;
    }>;
    players?: Array<{
        guildId: string;
        paused: boolean;
        track: unknown;
    }>;
}

interface CircuitBreaker {
    execute<T>(fn: () => Promise<T>): Promise<T>;
}

interface ShoukakuNode {
    name: string;
    state: number;
    stats: unknown;
    rest: {
        resolve(query: string): Promise<{
            loadType: string;
            data?: unknown;
            tracks?: unknown[];
        } | null>;
    };
}

interface ShoukakuPlayer {
    guildId: string;
    paused: boolean;
    track: unknown;
    position: number;
    volume: number;
    connection: {
        disconnect(): Promise<void>;
        channelId?: string;
    };
    playTrack(options: { track: { encoded: string } }): Promise<void>;
    stopTrack(): Promise<void>;
    setPaused(paused: boolean): Promise<void>;
    seekTo(position: number): Promise<void>;
    setGlobalVolume(volume: number): Promise<void>;
    on(event: string, listener: (...args: unknown[]) => void): void;
    removeAllListeners(): void;
}
// LAVALINK SERVICE CLASS
class LavalinkService {
    public shoukaku: Shoukaku | null = null;
    private client: Client | null = null;
    public isReady: boolean = false;
    private readyNodes: Set<string> = new Set();
    private circuitBreaker: CircuitBreaker | null | undefined = null;
    private watchdogTimer: ReturnType<typeof setInterval> | null = null;
    private reinitAttempts: number = 0;
    private static readonly MAX_REINIT_ATTEMPTS = 10;
    private static readonly WATCHDOG_INTERVAL = 30_000; // 30s
    private static readonly REINIT_DELAY = 15_000; // 15s between re-init attempts
    
    // Note: preservedQueues moved to Redis via CacheService for shard-safety

    /**
     * Pre-initialize Shoukaku with Discord client
     */
    preInitialize(client: Client): Shoukaku | null {
        if (this.shoukaku) {
            return this.shoukaku;
        }

        this.client = client;

        // Initialize circuit breaker and graceful degradation
        circuitBreakerRegistry.initialize();
        this.circuitBreaker = circuitBreakerRegistry.get('lavalink');
        
        // Register with graceful degradation
        gracefulDegradation.initialize();
        gracefulDegradation.registerFallback('lavalink', async () => ({
            error: 'LAVALINK_UNAVAILABLE',
            message: '🔇 Music service is temporarily unavailable. Your queue has been preserved.',
            preserved: true
        }));

        this.createShoukakuInstance();
        
        // Start watchdog to re-initialize if all nodes are permanently lost
        this.startWatchdog();

        return this.shoukaku;
    }

    /**
     * Create (or re-create) the Shoukaku instance
     */
    private createShoukakuInstance(): void {
        if (!this.client) return;

        // Clean up old instance
        if (this.shoukaku) {
            try {
                this.shoukaku.removeAllListeners();
                // Disconnect all nodes
                for (const [, node] of this.shoukaku.nodes as Map<string, ShoukakuNode>) {
                    try { (node as unknown as { disconnect: () => void }).disconnect?.(); } catch { /* ignore */ }
                }
            } catch { /* ignore cleanup errors */ }
            this.shoukaku = null;
            this.readyNodes.clear();
            this.isReady = false;
        }

        const configNodes = lavalinkConfig.nodes as NodeConfig[];
        const nodes = configNodes.map((node: NodeConfig) => ({
            name: node.name,
            url: node.url,
            auth: node.auth,
            secure: node.secure || false
        }));

        try {
            const connector = new Connectors.DiscordJS(this.client);
            this.shoukaku = new Shoukaku(connector, nodes, (lavalinkConfig as Record<string, unknown>).shoukakuOptions as Shoukaku['options'] | undefined);
            this.setupEventHandlers();
            logger.info('Lavalink', `Shoukaku instance created, connecting to ${nodes.length} nodes...`);
        } catch (error) {
            const err = error as Error;
            logger.error('Lavalink', `Initialization error: ${err.message}`);
            throw error;
        }
    }

    /**
     * Start watchdog that monitors node connectivity and re-initializes if needed
     */
    private startWatchdog(): void {
        if (this.watchdogTimer) return;

        this.watchdogTimer = setInterval(() => {
            // Skip if we have connected nodes
            if (this.isReady && this.readyNodes.size > 0) {
                this.reinitAttempts = 0; // Reset counter on success
                return;
            }

            // Check if Shoukaku has any nodes still reconnecting
            if (this.shoukaku) {
                const hasReconnecting = [...(this.shoukaku.nodes as Map<string, ShoukakuNode>).values()]
                    .some(n => n.state === 0 || n.state === 1); // CONNECTING or CONNECTED
                if (hasReconnecting) return; // Still trying, let Shoukaku handle it
            }

            // All nodes are dead and Shoukaku gave up — re-initialize
            if (this.reinitAttempts >= LavalinkService.MAX_REINIT_ATTEMPTS) {
                logger.warn('Lavalink', `Watchdog: gave up after ${this.reinitAttempts} re-init attempts. Music unavailable.`);
                this.stopWatchdog();
                return;
            }

            this.reinitAttempts++;
            logger.info('Lavalink', `Watchdog: all nodes lost, re-initializing (attempt ${this.reinitAttempts}/${LavalinkService.MAX_REINIT_ATTEMPTS})...`);

            try {
                this.createShoukakuInstance();
            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                logger.error('Lavalink', `Watchdog: re-init failed: ${msg}`);
            }
        }, LavalinkService.WATCHDOG_INTERVAL);

        // Don't block Node.js shutdown
        if (this.watchdogTimer && typeof this.watchdogTimer === 'object' && 'unref' in this.watchdogTimer) {
            this.watchdogTimer.unref();
        }
    }

    /**
     * Stop the watchdog timer
     */
    private stopWatchdog(): void {
        if (this.watchdogTimer) {
            clearInterval(this.watchdogTimer);
            this.watchdogTimer = null;
        }
    }

    /**
     * Setup Shoukaku event handlers
     */
    private setupEventHandlers(): void {
        if (!this.shoukaku) return;

        // Shoukaku v4.x 'ready' event signature: (name, lavalinkResume, libraryResume)
        this.shoukaku.on('ready', (name: string) => {
            logger.info('Lavalink', `Node "${name}" ready`);
            this.readyNodes.add(name);
            this.isReady = true;
            
            // Update Prometheus metrics
            updateLavalinkMetrics(name, true, 0);
            
            // Mark Lavalink as healthy
            gracefulDegradation.markHealthy('lavalink');
            
            // Try to restore preserved queues
            this._restorePreservedQueues();
        });

        this.shoukaku.on('error', (name: string, error: Error) => {
            logger.error('Lavalink', `Node "${name}" error: ${error.message}`);
            gracefulDegradation.markDegraded('lavalink', error.message);
        });

        this.shoukaku.on('close', (name: string, code: number) => {
            logger.info('Lavalink', `Node "${name}" closed (${code})`);
            this.readyNodes.delete(name);
            
            // Update Prometheus metrics
            updateLavalinkMetrics(name, false, 0);
            
            if (this.readyNodes.size === 0) {
                this.isReady = false;
                gracefulDegradation.markUnavailable('lavalink', 'All nodes disconnected');
                
                // Preserve all active queues
                this._preserveAllQueues();
            }
        });

        this.shoukaku.on('disconnect', (name: string) => {
            this.readyNodes.delete(name);
            
            // Update Prometheus metrics
            updateLavalinkMetrics(name, false, 0);
            
            if (this.readyNodes.size === 0) {
                this.isReady = false;
                gracefulDegradation.markUnavailable('lavalink', 'All nodes disconnected');
            }
        });

        this.shoukaku.on('reconnecting', (name: string, reconnectsLeft: number) => {
            logger.info('Lavalink', `Reconnecting "${name}" (${reconnectsLeft} left)`);
        });

        this.shoukaku.on('debug', () => {});
    }

    /**
     * Get Shoukaku manager
     */
    getManager(): Shoukaku | null {
        return this.shoukaku;
    }

    /**
     * Get player for guild
     */
    getPlayer(guildId: string): ShoukakuPlayer | null {
        return (this.shoukaku?.players as unknown as Map<string, ShoukakuPlayer>)?.get(guildId) || null;
    }

    /**
     * Create player for guild
     */
    async createPlayer(guildId: string, voiceChannelId: string, textChannelId: string): Promise<ShoukakuPlayer> {
        if (!this.shoukaku) {
            throw new Error('Shoukaku not initialized');
        }

        if (!this.isReady) {
            throw new Error('Lavalink not ready');
        }

        // Shoukaku node states: 0 = CONNECTING, 1 = CONNECTED, 2 = DISCONNECTING, 3 = DISCONNECTED
        const node = [...(this.shoukaku.nodes as Map<string, ShoukakuNode>).values()].find(n => n.state === 1);
        if (!node) throw new Error('No available nodes');

        try {
            const player = await this.shoukaku.joinVoiceChannel({
                guildId: guildId,
                channelId: voiceChannelId,
                shardId: this.client?.guilds.cache.get(guildId)?.shardId || 0,
                deaf: (lavalinkConfig as { playerOptions?: { selfDeafen?: boolean } }).playerOptions?.selfDeafen || true
            }) as unknown as ShoukakuPlayer;

            // Shoukaku setGlobalVolume: 100 = 100% volume (no distortion)
            const configVolume = (lavalinkConfig as { playerOptions?: { volume?: number } }).playerOptions?.volume || 100;
            await player.setGlobalVolume(configVolume);

            return player;

        } catch (error) {
            const err = error as Error;
            logger.error('Lavalink', `Failed to create player: ${err.message}`);
            throw error;
        }
    }

    /**
     * Destroy player for guild
     */
    destroyPlayer(guildId: string): void {
        const player = this.getPlayer(guildId);
        if (player) {
            this.shoukaku?.leaveVoiceChannel(guildId);
        }
    }

    /**
     * Search for tracks with circuit breaker protection
     */
    async search(query: string, requester?: unknown): Promise<SearchResult> {
        // Use circuit breaker for search operations
        return this.circuitBreaker!.execute(async () => {
            return this._searchInternal(query, requester);
        });
    }

    /**
     * Internal search implementation
     */
    private async _searchInternal(query: string, requester?: unknown): Promise<SearchResult> {
        if (!this.shoukaku) {
            logger.error('Lavalink', 'Cannot search: Shoukaku not initialized');
            throw new Error('Shoukaku not initialized');
        }

        if (!this.isReady) {
            logger.error('Lavalink', 'Cannot search: Lavalink not ready');
            throw new Error('Lavalink not ready');
        }

        let searchQuery = query;
        if (/^https?:\/\//.test(query)) {
            try {
                const url = new URL(query);
                url.searchParams.delete('si');
                url.searchParams.delete('feature');
                // Normalize Spotify /intl-XX/ locale prefix (LavaSrc doesn't handle it)
                if (url.hostname.includes('spotify.com')) {
                    url.pathname = url.pathname.replace(/\/intl-[a-z]{2}\//, '/');
                    url.pathname = url.pathname.replace(/\/intl\/[a-z]{2}\//, '/');
                }
                searchQuery = url.toString();
            } catch {
                // Use original query on parse failure
            }
        } else if (this.isSpotifyUrl(query)) {
            // Spotify URLs are handled directly by Lavalink plugins
            searchQuery = query;
        } else {
            searchQuery = `${(lavalinkConfig as { defaultSearchPlatform?: string }).defaultSearchPlatform}:${query}`;
        }

        // Shoukaku node states: 0 = CONNECTING, 1 = CONNECTED, 2 = DISCONNECTING, 3 = DISCONNECTED
        const node = [...(this.shoukaku.nodes as Map<string, ShoukakuNode>).values()].find(n => n.state === 1);

        if (!node) {
            logger.error('Lavalink', 'No available nodes');
            throw new Error('No available nodes');
        }

        try {
            let result = await node.rest.resolve(searchQuery);

            if (!result || result.loadType === 'error' || result.loadType === 'empty') {
                if (result?.loadType === 'error') {
                    const errorData = result.data as { message?: string; severity?: string; cause?: string } | undefined;
                    logger.warn('Lavalink', `Search returned error for "${searchQuery}": ${errorData?.message || 'unknown'} (severity: ${errorData?.severity || 'unknown'})`);
                }

                // For Spotify URLs that completely failed, try using Spotify API to get track metadata
                // then search YouTube by title + artist
                if (this.isSpotifyUrl(query)) {
                    const spotifyFallbackResult = await this._spotifyTrackFallback(query, node, requester);
                    if (spotifyFallbackResult) return spotifyFallbackResult;
                }

                const fallbackQuery = /^https?:\/\//.test(query) 
                    ? query 
                    : `${(lavalinkConfig as { fallbackSearchPlatform?: string }).fallbackSearchPlatform}:${query}`;
                
                result = await node.rest.resolve(fallbackQuery);

                if (!result || result.loadType === 'error' || result.loadType === 'empty') {
                    throw new Error('NO_RESULTS');
                }
            }

            let track: { encoded?: string; info?: { uri?: string; title?: string; length?: number; artworkUrl?: string; author?: string; sourceName?: string; identifier?: string; viewCount?: number }; pluginInfo?: { viewCount?: number; playCount?: number } } | undefined;
            if (result.loadType === 'track') {
                track = result.data as typeof track;
            } else if (result.loadType === 'search') {
                track = (result.data as typeof track[])?.[0];
            } else if (result.loadType === 'playlist') {
                track = ((result.data as { tracks?: typeof track[] })?.tracks)?.[0];
            } else {
                const data = result.data as { tracks?: typeof track[] } | typeof track[];
                track = (data as { tracks?: typeof track[] })?.tracks?.[0] || (data as typeof track[])?.[0] || (result.tracks as typeof track[])?.[0];
            }

            if (!track || !track.info) {
                throw new Error('NO_RESULTS');
            }

            // Spotify fallback: if resolved track has no encoded data (YouTube match not found),
            // try searching by title + author as a text query
            if ((!track.encoded || track.encoded === '') && this.isSpotifyUrl(query) && track.info.title) {
                const fallbackTextQuery = `${(lavalinkConfig as { defaultSearchPlatform?: string }).defaultSearchPlatform}:${track.info.title} ${track.info.author || ''}`;
                logger.info('Lavalink', `Spotify track unresolved, falling back to text search: ${fallbackTextQuery}`);
                try {
                    const fallbackResult = await node.rest.resolve(fallbackTextQuery);
                    if (fallbackResult && (fallbackResult.loadType === 'search' || fallbackResult.loadType === 'track')) {
                        const fallbackTrack = fallbackResult.loadType === 'track'
                            ? fallbackResult.data as typeof track
                            : (fallbackResult.data as typeof track[])?.[0];
                        if (fallbackTrack?.encoded && fallbackTrack.encoded !== '') {
                            // Merge: keep Spotify metadata (title, author, artwork) but use YouTube playback data
                            track = {
                                ...fallbackTrack,
                                info: {
                                    ...fallbackTrack.info,
                                    title: track.info?.title || fallbackTrack.info?.title,
                                    author: track.info?.author || fallbackTrack.info?.author,
                                    artworkUrl: track.info?.artworkUrl || fallbackTrack.info?.artworkUrl,
                                }
                            };
                            logger.info('Lavalink', `Spotify fallback found: ${track.info?.title}`);
                        }
                    }
                } catch (fallbackErr) {
                    logger.warn('Lavalink', `Spotify text search fallback failed: ${(fallbackErr as Error).message}`);
                }
            }

            const youtubeId = this.extractYouTubeId(track.info?.uri);
            
            // Try multiple thumbnail options with fallbacks
            let thumbnail: string | null = track.info?.artworkUrl || null;
            if (!thumbnail && youtubeId) {
                // Try hqdefault first (more reliable), then maxresdefault
                thumbnail = `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`;
            }

            const viewCount = track.pluginInfo?.viewCount || 
                            track.pluginInfo?.playCount || 
                            track.info?.viewCount ||
                            null;
            
            // Determine if this was a direct link search
            const isLinkSearch = /^https?:\/\//.test(query) || this.isSpotifyUrl(query);

            return {
                track: track,
                encoded: track.encoded || '',
                url: track.info?.uri || '',
                title: track.info?.title || '',
                lengthSeconds: Math.floor((track.info?.length || 0) / 1000),
                thumbnail: thumbnail,
                author: track.info?.author || '',
                requestedBy: requester,
                source: track.info?.sourceName || 'Unknown',
                viewCount: viewCount,
                identifier: youtubeId || track.info?.identifier || null,
                searchedByLink: isLinkSearch,
                originalQuery: isLinkSearch ? null : query
            };

        } catch (error) {
            const err = error as Error;
            logger.error('Lavalink', `Search error: ${err.message}`);
            throw new Error(err.message === 'NO_RESULTS' ? 'NO_RESULTS' : 'SEARCH_FAILED');
        }
    }

    /**
     * Spotify track fallback: use Spotify Web API to get track metadata, then search YouTube
     */
    private async _spotifyTrackFallback(query: string, node: ShoukakuNode, requester?: unknown): Promise<SearchResult | null> {
        if (!spotifyService.isConfigured()) return null;

        try {
            const spotifyId = spotifyService.extractSpotifyId(query);
            if (!spotifyId || spotifyId.type !== 'track') return null;

            const spotifyTrack = await spotifyService.getTrack(spotifyId.id);
            if (!spotifyTrack) return null;

            const searchText = `${spotifyTrack.name} ${spotifyTrack.artists.map(a => a.name).join(' ')}`;
            logger.info('Lavalink', `Spotify API fallback for track: "${searchText}"`);

            const searchQuery = `${(lavalinkConfig as { defaultSearchPlatform?: string }).defaultSearchPlatform}:${searchText}`;
            const result = await node.rest.resolve(searchQuery);

            if (!result || result.loadType === 'error' || result.loadType === 'empty') return null;

            type TrackData = { encoded?: string; info?: { uri?: string; title?: string; length?: number; artworkUrl?: string; author?: string; sourceName?: string; identifier?: string; viewCount?: number }; pluginInfo?: { viewCount?: number; playCount?: number } };
            let track: TrackData | undefined;
            if (result.loadType === 'track') {
                track = result.data as TrackData;
            } else if (result.loadType === 'search') {
                track = (result.data as TrackData[])?.[0];
            }

            if (!track?.encoded || !track.info) return null;

            // Use Spotify metadata (title, artist, artwork) with YouTube playback data
            const artworkUrl = spotifyTrack.album.images?.[0]?.url || track.info.artworkUrl;
            const youtubeId = this.extractYouTubeId(track.info.uri);

            logger.info('Lavalink', `Spotify API fallback resolved: "${spotifyTrack.name}" → "${track.info.title}"`);

            return {
                track: track,
                encoded: track.encoded,
                url: track.info.uri || '',
                title: spotifyTrack.name || track.info.title || '',
                lengthSeconds: Math.floor((spotifyTrack.duration_ms || track.info.length || 0) / 1000),
                thumbnail: artworkUrl || null,
                author: spotifyTrack.artists.map(a => a.name).join(', ') || track.info.author || '',
                requestedBy: requester,
                source: 'spotify',
                viewCount: track.pluginInfo?.viewCount || track.info.viewCount || null,
                identifier: youtubeId || track.info.identifier || null,
                searchedByLink: true,
                originalQuery: null
            };
        } catch (error) {
            logger.warn('Lavalink', `Spotify API track fallback failed: ${(error as Error).message}`);
            return null;
        }
    }

    /**
     * Spotify playlist fallback: use Spotify Web API (or embed scraping) to get playlist tracks, then search each on YouTube
     */
    private async _spotifyPlaylistFallback(query: string, node: ShoukakuNode, requester?: unknown): Promise<PlaylistResult | null> {
        if (!spotifyService.isConfigured()) return null;

        try {
            const spotifyId = spotifyService.extractSpotifyId(query);
            if (!spotifyId || (spotifyId.type !== 'playlist' && spotifyId.type !== 'album')) return null;

            logger.info('Lavalink', `Spotify fallback: fetching ${spotifyId.type} ${spotifyId.id} tracks (API → embed scraping)...`);
            const spotifyTracks = spotifyId.type === 'album'
                ? await spotifyService.getAlbumTracks(spotifyId.id)
                : await spotifyService.getPlaylistTracks(spotifyId.id);
            if (spotifyTracks.length === 0) return null;

            const resolvedTracks: SearchResult[] = [];
            const searchPlatform = (lavalinkConfig as { defaultSearchPlatform?: string }).defaultSearchPlatform;

            // Search each track on YouTube (with concurrency limit)
            const batchSize = 5;
            for (let i = 0; i < spotifyTracks.length; i += batchSize) {
                const batch = spotifyTracks.slice(i, i + batchSize);
                const promises = batch.map(async (st) => {
                    try {
                        // Try ISRC first if available, then title+artist
                        let searchQuery = st.isrc
                            ? `${searchPlatform}:"${st.isrc}"`
                            : `${searchPlatform}:${st.title} ${st.artist}`;

                        let result = await node.rest.resolve(searchQuery);

                        // If ISRC search fails, fall back to title+artist
                        if (st.isrc && (!result || result.loadType === 'error' || result.loadType === 'empty')) {
                            searchQuery = `${searchPlatform}:${st.title} ${st.artist}`;
                            result = await node.rest.resolve(searchQuery);
                        }

                        if (!result || result.loadType === 'error' || result.loadType === 'empty') return null;

                        type TrackData = { encoded?: string; info?: { uri?: string; title?: string; length?: number; artworkUrl?: string; author?: string; sourceName?: string; identifier?: string; viewCount?: number }; pluginInfo?: { viewCount?: number; playCount?: number } };
                        let track: TrackData | undefined;
                        if (result.loadType === 'track') {
                            track = result.data as TrackData;
                        } else if (result.loadType === 'search') {
                            track = (result.data as TrackData[])?.[0];
                        }

                        if (!track?.encoded || !track.info) return null;

                        const youtubeId = this.extractYouTubeId(track.info.uri);

                        return {
                            track: track,
                            encoded: track.encoded,
                            url: track.info.uri || '',
                            title: st.title || track.info.title || '',
                            lengthSeconds: Math.floor((st.duration_ms || track.info.length || 0) / 1000),
                            thumbnail: st.artworkUrl || track.info.artworkUrl || (youtubeId ? `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg` : null),
                            author: st.artist || track.info.author || '',
                            requestedBy: requester,
                            source: 'spotify' as const,
                            viewCount: track.pluginInfo?.viewCount || track.info.viewCount || null,
                            identifier: youtubeId || track.info.identifier || null,
                            searchedByLink: true,
                            originalQuery: null
                        } as SearchResult;
                    } catch {
                        return null;
                    }
                });

                const results = await Promise.all(promises);
                for (const r of results) {
                    if (r) resolvedTracks.push(r);
                }
            }

            if (resolvedTracks.length === 0) {
                logger.warn('Lavalink', `Spotify API fallback: none of ${spotifyTracks.length} tracks could be resolved on YouTube`);
                return null;
            }

            logger.info('Lavalink', `Spotify API fallback: resolved ${resolvedTracks.length}/${spotifyTracks.length} tracks`);

            return {
                playlistName: `Spotify Playlist (${resolvedTracks.length} tracks)`,
                tracks: resolvedTracks
            };
        } catch (error) {
            logger.warn('Lavalink', `Spotify API playlist fallback failed: ${(error as Error).message}`);
            return null;
        }
    }

    /**
     * Extract YouTube ID from URL
     */
    extractYouTubeId(url?: string): string | null {
        if (!url) return null;
        const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/);
        return match ? match[1] : null;
    }

    /**
     * Check if URL is a Spotify URL
     */
    isSpotifyUrl(url?: string): boolean {
        if (!url) return false;
        // Handle /intl-XX/ locale prefix in newer Spotify URLs
        return /^https?:\/\/(open\.)?spotify\.com\/(intl-[a-z]{2}\/)?(?:intl\/[a-z]{2}\/)?(?:embed\/)?(track|album|playlist|artist)\//.test(url);
    }

    /**
     * Search for multiple tracks (for autoplay)
     */
    async searchMultiple(query: string, limit: number = 5): Promise<MusicTrack[]> {
        if (!this.shoukaku || !this.isReady) {
            logger.info('Lavalink', `SearchMultiple: Not ready - shoukaku: ${!!this.shoukaku}, isReady: ${this.isReady}`);
            return [];
        }

        try {
            const searchQuery = `${(lavalinkConfig as { defaultSearchPlatform?: string }).defaultSearchPlatform}:${query}`;
            const node = [...(this.shoukaku.nodes as Map<string, ShoukakuNode>).values()].find(n => n.state === 1);

            if (!node) {
                const nodeStates = [...(this.shoukaku.nodes as Map<string, ShoukakuNode>).values()].map(n => ({ name: n.name, state: n.state }));
                logger.info('Lavalink', `SearchMultiple: No ready node. States: ${JSON.stringify(nodeStates)}`);
                return [];
            }

            logger.info('Lavalink', `SearchMultiple: Searching "${searchQuery}" on node ${node.name}`);
            const result = await node.rest.resolve(searchQuery);

            if (!result || result.loadType === 'error' || result.loadType === 'empty') {
                logger.info('Lavalink', `SearchMultiple: No results, loadType: ${result?.loadType}`);
                return [];
            }

            logger.info('Lavalink', `SearchMultiple: loadType=${result.loadType}, tracks found`);
            let tracks: Array<{ encoded?: string; info?: { uri?: string; title?: string; length?: number; artworkUrl?: string; author?: string; sourceName?: string; identifier?: string } }> = [];
            if (result.loadType === 'search' && Array.isArray(result.data)) {
                tracks = (result.data as typeof tracks).slice(0, limit);
            } else if (result.loadType === 'track' && result.data) {
                tracks = [result.data as typeof tracks[0]];
            } else if (result.loadType === 'playlist' && (result.data as { tracks?: typeof tracks })?.tracks) {
                tracks = ((result.data as { tracks: typeof tracks }).tracks).slice(0, limit);
            }

            return tracks.map(track => {
                const youtubeId = this.extractYouTubeId(track.info?.uri);
                return {
                    track: track,
                    encoded: track.encoded,
                    info: track.info,
                    url: track.info?.uri,
                    title: track.info?.title,
                    lengthSeconds: Math.floor((track.info?.length || 0) / 1000),
                    thumbnail: track.info?.artworkUrl || (youtubeId ? `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg` : null),
                    author: track.info?.author,
                    source: track.info?.sourceName || 'Unknown',
                    identifier: youtubeId || track.info?.identifier
                };
            });
        } catch (error) {
            const err = error as Error;
            logger.error('Lavalink', `SearchMultiple error: ${err.message}`);
            return [];
        }
    }

    /**
     * Extract Spotify ID from URL
     */
    extractSpotifyId(url?: string): { type: string; id: string } | null {
        if (!url) return null;
        const match = url.match(/spotify\.com\/(track|album|playlist|artist)\/([a-zA-Z0-9]+)/);
        return match ? { type: match[1], id: match[2] } : null;
    }

    /**
     * Search for playlist
     */
    async searchPlaylist(query: string, requester?: unknown): Promise<PlaylistResult> {
        if (!this.shoukaku) {
            throw new Error('Shoukaku not initialized');
        }

        if (!this.isReady) {
            throw new Error('Lavalink not ready');
        }

        let searchQuery = query;
        if (/^https?:\/\//.test(query)) {
            // Strip tracking params (si, feature) from URLs (including Spotify)
            try {
                const url = new URL(query);
                url.searchParams.delete('si');
                url.searchParams.delete('feature');
                // Normalize Spotify /intl-XX/ locale prefix (LavaSrc doesn't handle it)
                if (url.hostname.includes('spotify.com')) {
                    url.pathname = url.pathname.replace(/\/intl-[a-z]{2}\//, '/');
                    url.pathname = url.pathname.replace(/\/intl\/[a-z]{2}\//, '/');
                }
                searchQuery = url.toString();
            } catch {
                // Use original query on parse failure
            }
        } else {
            searchQuery = `${(lavalinkConfig as { defaultSearchPlatform?: string }).defaultSearchPlatform}:${query}`;
        }

        // Shoukaku node states: 0 = CONNECTING, 1 = CONNECTED, 2 = DISCONNECTING, 3 = DISCONNECTED
        const node = [...(this.shoukaku.nodes as Map<string, ShoukakuNode>).values()].find(n => n.state === 1);

        if (!node) {
            throw new Error('No available nodes');
        }

        try {
            logger.info('Lavalink', `Playlist search: ${searchQuery}`);
            let result = await node.rest.resolve(searchQuery);

            if (!result || result.loadType === 'error' || result.loadType === 'empty') {
                if (result?.loadType === 'error') {
                    const errorData = result.data as { message?: string; severity?: string; cause?: string } | undefined;
                    logger.warn('Lavalink', `Playlist search error data: ${errorData?.message || 'unknown'} (severity: ${errorData?.severity || 'unknown'}, cause: ${errorData?.cause || 'unknown'})`);
                }
                logger.info('Lavalink', `Playlist search failed (loadType: ${result?.loadType}), retrying with original query`);
                result = await node.rest.resolve(query);

                if (!result || result.loadType === 'error' || result.loadType === 'empty') {
                    // Fallback: use Spotify Web API to get playlist tracks, then search each on YouTube
                    if (this.isSpotifyUrl(query)) {
                        const spotifyFallbackResult = await this._spotifyPlaylistFallback(query, node, requester);
                        if (spotifyFallbackResult) return spotifyFallbackResult;
                    }
                    throw new Error('NO_RESULTS');
                }
            }

            if (result.loadType === 'playlist') {
                const playlistData = result.data as { info: { name: string }; tracks: Array<{ encoded?: string; info?: { uri?: string; title?: string; length?: number; artworkUrl?: string; author?: string; sourceName?: string; identifier?: string; viewCount?: number }; pluginInfo?: { viewCount?: number; playCount?: number } }> };
                const tracks = playlistData.tracks.map(track => {
                    const youtubeId = this.extractYouTubeId(track.info?.uri);
                    
                    // Try multiple thumbnail options with fallbacks
                    let thumbnail: string | null = track.info?.artworkUrl || null;
                    if (!thumbnail && youtubeId) {
                        thumbnail = `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`;
                    }

                    const viewCount = track.pluginInfo?.viewCount || 
                                    track.pluginInfo?.playCount || 
                                    track.info?.viewCount ||
                                    null;

                    return {
                        track: track,
                        encoded: track.encoded || '',
                        url: track.info?.uri || '',
                        title: track.info?.title || '',
                        lengthSeconds: Math.floor((track.info?.length || 0) / 1000),
                        thumbnail: thumbnail,
                        author: track.info?.author || '',
                        requestedBy: requester,
                        source: track.info?.sourceName || 'Unknown',
                        viewCount: viewCount,
                        identifier: youtubeId || track.info?.identifier || null,
                        searchedByLink: true,
                        originalQuery: null
                    };
                });

                // Filter out unplayable tracks (no encoded data = Spotify track not resolved to YouTube)
                const playableTracks = tracks.filter(t => t.encoded && t.encoded !== '');
                if (playableTracks.length === 0) {
                    logger.warn('Lavalink', `Spotify playlist "${playlistData.info.name}" had ${tracks.length} tracks but none were playable (no YouTube match found)`);
                    throw new Error('NO_RESULTS');
                }

                if (playableTracks.length < tracks.length) {
                    logger.info('Lavalink', `Spotify playlist: ${playableTracks.length}/${tracks.length} tracks playable`);
                }

                return {
                    playlistName: playlistData.info.name,
                    tracks: playableTracks
                };
            }

            throw new Error('NOT_A_PLAYLIST');

        } catch (error) {
            const err = error as Error;
            logger.error('Lavalink', `Playlist search error: ${err.message}`);
            throw error;
        }
    }

    /**
     * Get node status
     */
    getNodeStatus(): NodeStatus {
        if (!this.shoukaku) {
            return { ready: false, activeConnections: 0, error: 'Not initialized' };
        }

        const nodes = Array.from((this.shoukaku.nodes as Map<string, ShoukakuNode>).values()).map(node => ({
            name: node.name,
            state: node.state,
            stats: node.stats
        }));

        return {
            ready: this.isReady,
            activeConnections: (this.shoukaku.players as unknown as Map<string, ShoukakuPlayer>).size,
            nodes: nodes,
            players: Array.from((this.shoukaku.players as unknown as Map<string, ShoukakuPlayer>).values()).map(p => ({
                guildId: p.guildId,
                paused: p.paused,
                track: p.track
            }))
        };
    }

    /**
     * Shutdown (used by container)
     */
    async shutdown(): Promise<void> {
        if (this.shoukaku) {
            // Disconnect all players
            for (const [, player] of (this.shoukaku.players as unknown as Map<string, ShoukakuPlayer>)) {
                try {
                    await player.connection.disconnect();
                } catch {
                    // Ignore cleanup errors
                }
            }
            logger.info('Lavalink', 'Shutdown complete');
        }
    }

    /**
     * Preserve all active queues when Lavalink goes down
     * Now uses Redis for shard-safety
     */
    private async _preserveAllQueues(): Promise<void> {
        if (!this.shoukaku) return;
        
        let preservedCount = 0;
        
        for (const [guildId, player] of (this.shoukaku.players as unknown as Map<string, ShoukakuPlayer>)) {
            try {
                // Preserve current state to Redis
                const state: PreservedState = {
                    timestamp: Date.now(),
                    track: player.track,
                    position: player.position,
                    paused: player.paused,
                    volume: player.volume,
                    // Note: Queue itself is managed by QueueService, not LavalinkService
                };
                
                await cacheService.preserveQueueState(guildId, state);
                preservedCount++;
                
                logger.info('Lavalink', `Preserved state for guild ${guildId}`);
            } catch (error) {
                const err = error as Error;
                logger.error('Lavalink', `Failed to preserve queue for ${guildId}: ${err.message}`);
            }
        }
        
        logger.info('Lavalink', `Preserved ${preservedCount} guild states to Redis`);
    }

    /**
     * Restore preserved queues when Lavalink comes back
     * Now reads from Redis for shard-safety
     */
    private async _restorePreservedQueues(): Promise<void> {
        try {
            const guildIds = await cacheService.getAllPreservedQueueGuildIds();
            if (guildIds.length === 0) return;
            
            const staleThreshold = 30 * 60 * 1000; // 30 minutes
            const now = Date.now();
            
            for (const guildId of guildIds) {
                const state = await cacheService.getPreservedQueueState<PreservedState>(guildId);
                if (!state) continue;
                
                // Skip stale queues
                if (now - state.timestamp > staleThreshold) {
                    logger.info('Lavalink', `Skipping stale queue for guild ${guildId}`);
                    await cacheService.clearPreservedQueueState(guildId);
                    continue;
                }
                
                // Emit event for QueueService to handle restoration
                // The actual restoration will be handled by the music event system
                logger.info('Lavalink', `Queue restoration available for guild ${guildId}`);
            }
        } catch (error) {
            logger.error('Lavalink', `Error restoring preserved queues: ${(error as Error).message}`);
        }
    }

    /**
     * Get preserved queue state for a guild
     * Now reads from Redis for shard-safety
     */
    async getPreservedState(guildId: string): Promise<PreservedState | null> {
        return cacheService.getPreservedQueueState<PreservedState>(guildId);
    }

    /**
     * Clear preserved state for a guild
     * Now clears from Redis for shard-safety
     */
    async clearPreservedState(guildId: string): Promise<void> {
        await cacheService.clearPreservedQueueState(guildId);
    }

    /**
     * Check if Lavalink is available with graceful degradation
     */
    isAvailable(): boolean {
        const isServiceAvailable = gracefulDegradation.isAvailable('lavalink');
        return this.isReady && isServiceAvailable;
    }
}

// Create default instance for backward compatibility
const lavalinkService = new LavalinkService();

export { LavalinkService };
export type { SearchResult, PlaylistResult, PreservedState, NodeStatus };
export default lavalinkService;
