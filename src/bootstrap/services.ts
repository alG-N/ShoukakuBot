import container from '../container.js';
import { logger } from '../core/Logger.js';

import postgres from '../database/postgres.js';
import redisCache from '../cache/RedisCache.js';
import cacheService from '../cache/CacheService.js';
import commandRegistry from '../services/registry/CommandRegistry.js';
import eventRegistry from '../services/registry/EventRegistry.js';

import circuitBreakerRegistry from '../core/CircuitBreakerRegistry.js';
import gracefulDegradation from '../core/GracefulDegradation.js';

import anilistService from '../services/api/anilistService.js';
import embedService from '../services/api/embedService.js';
import myAnimeListService from '../services/api/myAnimeListService.js';
import nhentaiService from '../services/api/nhentaiService.js';
import pixivService from '../services/api/pixivService.js';
import redditService from '../services/api/redditService.js';
import rule34Service from '../services/api/rule34Service.js';
import steamService from '../services/api/steamService.js';
import wikipediaService from '../services/api/wikipediaService.js';

import lavalinkService from '../services/music/core/LavalinkService.js';
import musicFacade from '../services/music/core/MusicFacade.js';
import voiceConnectionService from '../services/music/voice/VoiceConnectionService.js';
import queueService from '../services/music/queue/QueueService.js';
import playbackService from '../services/music/playback/PlaybackService.js';
import autoPlayService from '../services/music/autoplay/AutoPlayService.js';
import spotifyService from '../services/music/spotify/SpotifyService.js';
import musicEventBus from '../services/music/events/MusicEventBus.js';
import playbackEventHandler from '../services/music/events/PlaybackEventHandler.js';

import musicCacheFacade from '../cache/music/MusicCacheFacade.js';
import queueCache from '../cache/music/QueueCache.js';
import userMusicCache from '../cache/music/UserMusicCache.js';
import voteCache from '../cache/music/VoteCache.js';
import guildMusicCache from '../cache/music/GuildMusicCache.js';

import videoDownloadService from '../services/video/VideoDownloadService.js';
import videoProcessingService from '../services/video/VideoProcessingService.js';
import cobaltService from '../services/video/CobaltService.js';
import ytDlpService from '../services/video/YtDlpService.js';

import shardBridge from '../services/guild/ShardBridge.js';
import setupWizardService from '../services/guild/SetupWizardService.js';

import antiRaidService from '../services/moderation/AntiRaidService.js';
import lockdownService from '../services/moderation/LockdownService.js';
import snipeService from '../services/moderation/SnipeService.js';

import battleService from '../services/fun/deathbattle/BattleService.js';
import sayService from '../services/fun/say/SayService.js';

import nhentaiHandler from '../handlers/api/nhentai/index.js';

import rule34Cache from '../cache/api/rule34Cache.js';
import redditCache from '../cache/api/redditCache.js';

import voiceStateUpdate from '../events/voiceStateUpdate.js';
import readyEvent from '../events/ready.js';

export function registerServices(): void {
    logger.info('Container', 'Registering services with DI container...');

    container.instance('database', postgres);
    container.instance('redisCache', redisCache);
    container.instance('cacheService', cacheService);
    container.instance('commandRegistry', commandRegistry);
    container.instance('eventRegistry', eventRegistry);

    container.instance('circuitBreakerRegistry', circuitBreakerRegistry);
    container.instance('gracefulDegradation', gracefulDegradation);

    container.instance('anilistService', anilistService);
    container.instance('embedService', embedService);
    container.instance('myAnimeListService', myAnimeListService);
    container.instance('nhentaiService', nhentaiService);
    container.instance('pixivService', pixivService);
    container.instance('redditService', redditService);
    container.instance('rule34Service', rule34Service);
    container.instance('steamService', steamService);
    container.instance('wikipediaService', wikipediaService);

    container.instance('lavalinkService', lavalinkService);
    container.instance('musicFacade', musicFacade);
    container.instance('voiceConnectionService', voiceConnectionService);
    container.instance('queueService', queueService);
    container.instance('playbackService', playbackService);
    container.instance('autoPlayService', autoPlayService);
    container.instance('spotifyService', spotifyService);
    container.instance('musicEventBus', musicEventBus);
    container.instance('playbackEventHandler', playbackEventHandler);

    container.instance('musicCacheFacade', musicCacheFacade);
    container.instance('queueCache', queueCache);
    container.instance('userMusicCache', userMusicCache);
    container.instance('voteCache', voteCache);
    container.instance('guildMusicCache', guildMusicCache);

    container.instance('videoDownloadService', videoDownloadService);
    container.instance('videoProcessingService', videoProcessingService);
    container.instance('cobaltService', cobaltService);
    container.instance('ytDlpService', ytDlpService);

    container.instance('shardBridge', shardBridge);
    container.instance('setupWizardService', setupWizardService);

    container.instance('antiRaidService', antiRaidService);
    container.instance('lockdownService', lockdownService);
    container.instance('snipeService', snipeService);

    container.instance('battleService', battleService);
    container.instance('sayService', sayService);

    container.instance('nhentaiHandler', nhentaiHandler);

    container.instance('rule34Cache', rule34Cache);
    container.instance('redditCache', redditCache);

    container.instance('voiceStateUpdate', voiceStateUpdate);
    container.instance('readyEvent', readyEvent);

    logger.info('Container', `All services registered (${container.getDebugInfo().instantiated.length} instances)`);
}



