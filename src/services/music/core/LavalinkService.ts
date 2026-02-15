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

            const youtubeId = this.extractYouTubeId(track.info.uri);
            
            // Try multiple thumbnail options with fallbacks
            let thumbnail: string | null = track.info.artworkUrl || null;
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
                url: track.info.uri || '',
                title: track.info.title || '',
                lengthSeconds: Math.floor((track.info.length || 0) / 1000),
                thumbnail: thumbnail,
                author: track.info.author || '',
                requestedBy: requester,
                source: track.info.sourceName || 'Unknown',
                viewCount: viewCount,
                identifier: youtubeId || track.info.identifier || null,
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
        return /^https?:\/\/(open\.)?spotify\.com\/(track|album|playlist|artist)\//.test(url);
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
        if (!/^https?:\/\//.test(query)) {
            searchQuery = `${(lavalinkConfig as { defaultSearchPlatform?: string }).defaultSearchPlatform}:${query}`;
        }

        // Shoukaku node states: 0 = CONNECTING, 1 = CONNECTED, 2 = DISCONNECTING, 3 = DISCONNECTED
        const node = [...(this.shoukaku.nodes as Map<string, ShoukakuNode>).values()].find(n => n.state === 1);

        if (!node) {
            throw new Error('No available nodes');
        }

        try {
            let result = await node.rest.resolve(searchQuery);

            if (!result || result.loadType === 'error' || result.loadType === 'empty') {
                result = await node.rest.resolve(query);

                if (!result || result.loadType === 'error' || result.loadType === 'empty') {
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

                return {
                    playlistName: playlistData.info.name,
                    tracks: tracks
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
