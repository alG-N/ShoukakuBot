/**
 * Service Provider - Registers all services with the container
 * This is the central place for dependency configuration
 * 
 * Strategy: Use container.instance() for pre-existing module-level singletons.
 * This ensures container.resolve() returns the SAME instance as direct imports,
 * eliminating the dual-instance problem described in SYSTEM_REVIEW §4.1.
 * 
 * Container.shutdown() handles lifecycle: it calls shutdown() / destroy() / close()
 * on all registered instances automatically.
 * 
 * @module bootstrap/services
 */

import container from '../container.js';
import { logger } from '../core/Logger.js';

// ── CORE ──────────────────────────────────────────────────────────────
import postgres from '../database/postgres.js';
import redisCache from '../services/guild/RedisCache.js';
import cacheService from '../cache/CacheService.js';
import commandRegistry from '../services/registry/CommandRegistry.js';
import eventRegistry from '../services/registry/EventRegistry.js';

// ── CORE INFRASTRUCTURE ──────────────────────────────────────────────
import circuitBreakerRegistry from '../core/CircuitBreakerRegistry.js';
import gracefulDegradation from '../core/GracefulDegradation.js';

// ── API SERVICES ─────────────────────────────────────────────────────
import anilistService from '../services/api/anilistService.js';
import fandomService from '../services/api/fandomService.js';
import googleService from '../services/api/googleService.js';
import myAnimeListService from '../services/api/myAnimeListService.js';
import nhentaiService from '../services/api/nhentaiService.js';
import pixivService from '../services/api/pixivService.js';
import redditService from '../services/api/redditService.js';
import rule34Service from '../services/api/rule34Service.js';
import steamService from '../services/api/steamService.js';
import wikipediaService from '../services/api/wikipediaService.js';

// ── MUSIC SERVICES ───────────────────────────────────────────────────
import lavalinkService from '../services/music/LavalinkService.js';
import musicFacade from '../services/music/MusicFacade.js';
import voiceConnectionService from '../services/music/voice/VoiceConnectionService.js';
import queueService from '../services/music/queue/QueueService.js';
import playbackService from '../services/music/playback/PlaybackService.js';
import autoPlayService from '../services/music/autoplay/AutoPlayService.js';
import musicEventBus from '../services/music/events/MusicEventBus.js';
import playbackEventHandler from '../services/music/events/PlaybackEventHandler.js';

// ── MUSIC CACHES ─────────────────────────────────────────────────────
import musicCacheFacade from '../cache/music/MusicCacheFacade.js';
import queueCache from '../cache/music/QueueCache.js';
import userMusicCache from '../cache/music/UserMusicCache.js';
import voteCache from '../cache/music/VoteCache.js';
import guildMusicCache from '../cache/music/GuildMusicCache.js';

// ── VIDEO SERVICES ───────────────────────────────────────────────────
import videoDownloadService from '../services/video/VideoDownloadService.js';
import videoProcessingService from '../services/video/VideoProcessingService.js';
import cobaltService from '../services/video/CobaltService.js';
import ytDlpService from '../services/video/YtDlpService.js';

// ── GUILD SERVICES ───────────────────────────────────────────────────
import shardBridge from '../services/guild/ShardBridge.js';
import setupWizardService from '../services/guild/SetupWizardService.js';

// ── MODERATION SERVICES ──────────────────────────────────────────────
import antiRaidService from '../services/moderation/AntiRaidService.js';
import lockdownService from '../services/moderation/LockdownService.js';
import snipeService from '../services/moderation/SnipeService.js';

// ── FUN SERVICES ─────────────────────────────────────────────────────
import battleService from '../services/fun/deathbattle/BattleService.js';
import sayService from '../services/fun/say/SayService.js';

// ── HANDLERS WITH STATE ──────────────────────────────────────────────
import nhentaiHandler from '../handlers/api/nhentaiHandler.js';

// ── REPOSITORIES WITH LIFECYCLE ──────────────────────────────────────
import rule34Cache from '../repositories/api/rule34Cache.js';
import redditCache from '../repositories/api/redditCache.js';

// ── EVENTS WITH LIFECYCLE ────────────────────────────────────────────
import voiceStateUpdate from '../events/voiceStateUpdate.js';
import readyEvent from '../events/ready.js';

/**
 * Register all application services with the DI container.
 * Uses container.instance() to register pre-existing module-level singletons,
 * ensuring container.resolve() returns the same instance as direct imports.
 * 
 * Call this once during application startup.
 */
export function registerServices(): void {
    logger.info('Container', 'Registering services with DI container...');

    // ── CORE SERVICES ────────────────────────────────────────────────
    container.instance('database', postgres);
    container.instance('redisCache', redisCache);
    container.instance('cacheService', cacheService);
    container.instance('commandRegistry', commandRegistry);
    container.instance('eventRegistry', eventRegistry);

    // ── CORE INFRASTRUCTURE ──────────────────────────────────────────
    container.instance('circuitBreakerRegistry', circuitBreakerRegistry);
    container.instance('gracefulDegradation', gracefulDegradation);

    // ── API SERVICES ─────────────────────────────────────────────────
    container.instance('anilistService', anilistService);
    container.instance('fandomService', fandomService);
    container.instance('googleService', googleService);
    container.instance('myAnimeListService', myAnimeListService);
    container.instance('nhentaiService', nhentaiService);
    container.instance('pixivService', pixivService);
    container.instance('redditService', redditService);
    container.instance('rule34Service', rule34Service);
    container.instance('steamService', steamService);
    container.instance('wikipediaService', wikipediaService);

    // ── MUSIC SERVICES ───────────────────────────────────────────────
    container.instance('lavalinkService', lavalinkService);
    container.instance('musicFacade', musicFacade);
    container.instance('voiceConnectionService', voiceConnectionService);
    container.instance('queueService', queueService);
    container.instance('playbackService', playbackService);
    container.instance('autoPlayService', autoPlayService);
    container.instance('musicEventBus', musicEventBus);
    container.instance('playbackEventHandler', playbackEventHandler);

    // ── MUSIC CACHES ─────────────────────────────────────────────────
    container.instance('musicCacheFacade', musicCacheFacade);
    container.instance('queueCache', queueCache);
    container.instance('userMusicCache', userMusicCache);
    container.instance('voteCache', voteCache);
    container.instance('guildMusicCache', guildMusicCache);

    // ── VIDEO SERVICES ───────────────────────────────────────────────
    container.instance('videoDownloadService', videoDownloadService);
    container.instance('videoProcessingService', videoProcessingService);
    container.instance('cobaltService', cobaltService);
    container.instance('ytDlpService', ytDlpService);

    // ── GUILD SERVICES ───────────────────────────────────────────────
    container.instance('shardBridge', shardBridge);
    container.instance('setupWizardService', setupWizardService);

    // ── MODERATION SERVICES ──────────────────────────────────────────
    container.instance('antiRaidService', antiRaidService);
    container.instance('lockdownService', lockdownService);
    container.instance('snipeService', snipeService);

    // ── FUN SERVICES ─────────────────────────────────────────────────
    container.instance('battleService', battleService);
    container.instance('sayService', sayService);

    // ── HANDLERS WITH STATE ──────────────────────────────────────────
    container.instance('nhentaiHandler', nhentaiHandler);

    // ── REPOSITORIES WITH LIFECYCLE ──────────────────────────────────
    container.instance('rule34Cache', rule34Cache);
    container.instance('redditCache', redditCache);

    // ── EVENTS WITH LIFECYCLE ────────────────────────────────────────
    container.instance('voiceStateUpdate', voiceStateUpdate);
    container.instance('readyEvent', readyEvent);

    logger.info('Container', `All services registered (${container.getDebugInfo().instantiated.length} instances)`);
}

// Named export only — use `import { registerServices } from '...'`
