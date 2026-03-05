# Types/Interface/Enum Scan - 2026-03-05 (Post API Hotspot Wave)

## Summary

- Files scanned: 279
- Total type declarations: 242
- Total interface declarations: 523
- Total enum declarations: 2
- Total declarations: 767

## Distribution

- Inside src/types/**: type=24, interface=269, enum=2, total=295
- Outside src/types/**: type=218, interface=254, enum=0, total=472

## Top outside-density files

| File | total |
|---|---:|
| src/handlers/api/animeHandler.ts | 10 |
| src/handlers/api/nhentaiHandler.ts | 9 |
| src/services/api/index.ts | 9 |
| src/commands/api/rule34.ts | 8 |
| src/repositories/api/rule34Cache.ts | 8 |
| src/services/music/core/MusicTypes.ts | 8 |
| src/utils/video/progressAnimator.ts | 8 |
| src/commands/video/video.ts | 7 |
| src/handlers/api/index.ts | 7 |
| src/handlers/api/rule34PostHandler.ts | 7 |
| src/repositories/moderation/FilterRepository.ts | 7 |
| src/services/music/events/PlaybackEventHandler.ts | 7 |
| src/cache/music/GuildMusicCache.ts | 6 |
| src/cache/music/VoteCache.ts | 6 |
| src/commands/fun/deathbattle.ts | 6 |
| src/core/health.ts | 6 |
| src/core/index.ts | 6 |
| src/handlers/api/pixivContentHandler.ts | 6 |
| src/handlers/moderation/index.ts | 6 |
| src/services/api/rule34Service.ts | 6 |

## Per-file Declaration Counts

| File | type | interface | enum | total |
|---|---:|---:|---:|---:|
| src/types/api/mal-service.ts | 0 | 33 | 0 | 33 |
| src/types/config/moderation.ts | 1 | 30 | 0 | 31 |
| src/types/core/runtime.ts | 5 | 21 | 2 | 28 |
| src/types/api/anime.ts | 0 | 16 | 0 | 16 |
| src/types/api/rule34.ts | 4 | 10 | 0 | 14 |
| src/types/music/session.ts | 2 | 12 | 0 | 14 |
| src/types/api/content-session.ts | 0 | 13 | 0 | 13 |
| src/types/infrastructure/cache.ts | 1 | 12 | 0 | 13 |
| src/types/config/video.ts | 0 | 11 | 0 | 11 |
| src/handlers/api/animeHandler.ts | 1 | 9 | 0 | 10 |
| src/types/api/nhentai.ts | 0 | 10 | 0 | 10 |
| src/handlers/api/nhentaiHandler.ts | 8 | 1 | 0 | 9 |
| src/services/api/index.ts | 9 | 0 | 0 | 9 |
| src/types/api/pixiv.ts | 0 | 9 | 0 | 9 |
| src/types/api/wikipedia.ts | 0 | 9 | 0 | 9 |
| src/commands/api/rule34.ts | 6 | 2 | 0 | 8 |
| src/repositories/api/rule34Cache.ts | 1 | 7 | 0 | 8 |
| src/services/music/core/MusicTypes.ts | 4 | 4 | 0 | 8 |
| src/types/api/pixiv-service.ts | 0 | 8 | 0 | 8 |
| src/types/api/reddit-service.ts | 3 | 5 | 0 | 8 |
| src/types/api/steam.ts | 0 | 8 | 0 | 8 |
| src/utils/video/progressAnimator.ts | 1 | 7 | 0 | 8 |
| src/commands/video/video.ts | 1 | 6 | 0 | 7 |
| src/handlers/api/index.ts | 7 | 0 | 0 | 7 |
| src/handlers/api/rule34PostHandler.ts | 2 | 5 | 0 | 7 |
| src/repositories/moderation/FilterRepository.ts | 3 | 4 | 0 | 7 |
| src/services/music/events/PlaybackEventHandler.ts | 2 | 5 | 0 | 7 |
| src/types/moderation/infraction.ts | 1 | 6 | 0 | 7 |
| src/types/moderation/services.ts | 0 | 7 | 0 | 7 |
| src/types/music/preferences.ts | 0 | 7 | 0 | 7 |
| src/cache/music/GuildMusicCache.ts | 0 | 6 | 0 | 6 |
| src/cache/music/VoteCache.ts | 1 | 5 | 0 | 6 |
| src/commands/fun/deathbattle.ts | 4 | 2 | 0 | 6 |
| src/core/health.ts | 1 | 5 | 0 | 6 |
| src/core/index.ts | 6 | 0 | 0 | 6 |
| src/handlers/api/pixivContentHandler.ts | 1 | 5 | 0 | 6 |
| src/handlers/moderation/index.ts | 6 | 0 | 0 | 6 |
| src/services/api/rule34Service.ts | 1 | 5 | 0 | 6 |
| src/services/moderation/SnipeService.ts | 1 | 5 | 0 | 6 |
| src/services/music/index.ts | 6 | 0 | 0 | 6 |
| src/services/music/spotify/SpotifyService.ts | 0 | 6 | 0 | 6 |
| src/services/video/YtDlpService.ts | 1 | 5 | 0 | 6 |
| src/types/infrastructure/database.ts | 1 | 5 | 0 | 6 |
| src/cache/music/index.ts | 5 | 0 | 0 | 5 |
| src/commands/api/reddit.ts | 1 | 4 | 0 | 5 |
| src/commands/BaseCommand.ts | 1 | 4 | 0 | 5 |
| src/middleware/checks.ts | 2 | 3 | 0 | 5 |
| src/repositories/api/nhentaiRepository.ts | 3 | 2 | 0 | 5 |
| src/services/api/anilistService.ts | 1 | 4 | 0 | 5 |
| src/services/moderation/AntiRaidService.ts | 0 | 5 | 0 | 5 |
| src/services/moderation/index.ts | 5 | 0 | 0 | 5 |
| src/services/video/VideoProcessingService.ts | 1 | 4 | 0 | 5 |
| src/types/moderation/lockdown.ts | 0 | 5 | 0 | 5 |
| src/types/music/lavalink.ts | 0 | 5 | 0 | 5 |
| src/types/music/queue.ts | 1 | 4 | 0 | 5 |
| src/types/video/processing.ts | 0 | 5 | 0 | 5 |
| src/utils/deathbattle/embedBuilder.ts | 1 | 4 | 0 | 5 |
| src/cache/music/QueueCache.ts | 1 | 3 | 0 | 4 |
| src/commands/api/anime.ts | 2 | 2 | 0 | 4 |
| src/commands/api/pixiv.ts | 1 | 3 | 0 | 4 |
| src/config/maintenance.ts | 0 | 4 | 0 | 4 |
| src/constants.ts | 4 | 0 | 0 | 4 |
| src/container.ts | 0 | 4 | 0 | 4 |
| src/core/Result.ts | 0 | 4 | 0 | 4 |
| src/errors/index.ts | 4 | 0 | 0 | 4 |
| src/repositories/api/redditCache.ts | 3 | 1 | 0 | 4 |
| src/repositories/general/AfkRepository.ts | 1 | 3 | 0 | 4 |
| src/services/fun/deathbattle/BattleService.ts | 0 | 4 | 0 | 4 |
| src/services/guild/ShardBridge.ts | 0 | 4 | 0 | 4 |
| src/services/music/core/LavalinkService.ts | 1 | 3 | 0 | 4 |
| src/services/music/events/MusicEvents.ts | 4 | 0 | 0 | 4 |
| src/services/music/voice/VoiceConnectionService.ts | 1 | 3 | 0 | 4 |
| src/services/video/CobaltService.ts | 1 | 3 | 0 | 4 |
| src/types/api/mal.ts | 2 | 2 | 0 | 4 |
| src/utils/video/videoEmbedBuilder.ts | 1 | 3 | 0 | 4 |
| src/commands/admin/raid.ts | 1 | 2 | 0 | 3 |
| src/commands/admin/warn.ts | 1 | 2 | 0 | 3 |
| src/commands/api/nhentai.ts | 2 | 1 | 0 | 3 |
| src/core/CircuitBreakerRegistry.ts | 0 | 3 | 0 | 3 |
| src/core/ErrorCodes.ts | 3 | 0 | 0 | 3 |
| src/core/errorHandler.ts | 1 | 2 | 0 | 3 |
| src/core/sentry.ts | 0 | 3 | 0 | 3 |
| src/core/shutdown.ts | 0 | 3 | 0 | 3 |
| src/database/postgres.ts | 2 | 1 | 0 | 3 |
| src/handlers/api/redditPostHandler.ts | 2 | 1 | 0 | 3 |
| src/handlers/moderation/AutoModHandler.ts | 2 | 1 | 0 | 3 |
| src/handlers/moderation/AutoModTypes.ts | 2 | 1 | 0 | 3 |
| src/handlers/music/trackTypes.ts | 3 | 0 | 0 | 3 |
| src/middleware/access.ts | 3 | 0 | 0 | 3 |
| src/middleware/rateLimiter.ts | 0 | 3 | 0 | 3 |
| src/middleware/voiceChannelCheck.ts | 2 | 1 | 0 | 3 |
| src/repositories/api/animeRepository.ts | 1 | 2 | 0 | 3 |
| src/repositories/api/pixivCache.ts | 1 | 2 | 0 | 3 |
| src/repositories/moderation/AutoModRepository.ts | 2 | 1 | 0 | 3 |
| src/services/api/embedService.ts | 0 | 3 | 0 | 3 |
| src/services/moderation/AutoModService.ts | 1 | 2 | 0 | 3 |
| src/services/music/autoplay/AutoPlayService.ts | 0 | 3 | 0 | 3 |
| src/services/video/index.ts | 3 | 0 | 0 | 3 |
| src/services/video/VideoDownloadService.ts | 1 | 2 | 0 | 3 |
| src/types/api/reddit.ts | 0 | 3 | 0 | 3 |
| src/types/moderation/modlog.ts | 1 | 2 | 0 | 3 |
| src/types/music/playback.ts | 1 | 2 | 0 | 3 |
| src/utils/common/cooldown.ts | 0 | 3 | 0 | 3 |
| src/utils/video/platformDetector.ts | 1 | 2 | 0 | 3 |
| src/cache/music/MusicCacheFacade.ts | 1 | 1 | 0 | 2 |
| src/commands/api/wikipedia.ts | 1 | 1 | 0 | 2 |
| src/commands/music/music.ts | 1 | 1 | 0 | 2 |
| src/config/deathbattle/skillsets/types.ts | 0 | 2 | 0 | 2 |
| src/config/features/moderation/index.ts | 2 | 0 | 0 | 2 |
| src/config/validation.ts | 0 | 2 | 0 | 2 |
| src/errors/AppError.ts | 1 | 1 | 0 | 2 |
| src/handlers/api/steamSaleHandler.ts | 1 | 1 | 0 | 2 |
| src/handlers/moderation/ModLogHandler.ts | 1 | 1 | 0 | 2 |
| src/handlers/music/playHandler.ts | 0 | 2 | 0 | 2 |
| src/index.ts | 0 | 2 | 0 | 2 |
| src/middleware/index.ts | 2 | 0 | 0 | 2 |
| src/services/api/nhentaiService.ts | 1 | 1 | 0 | 2 |
| src/services/api/pixivService.ts | 2 | 0 | 0 | 2 |
| src/services/api/redditService.ts | 2 | 0 | 0 | 2 |
| src/services/api/wikipediaService.ts | 2 | 0 | 0 | 2 |
| src/services/fun/deathbattle/index.ts | 2 | 0 | 0 | 2 |
| src/services/guild/SetupWizardService.ts | 1 | 1 | 0 | 2 |
| src/services/moderation/FilterService.ts | 0 | 2 | 0 | 2 |
| src/services/moderation/ModerationService.ts | 0 | 2 | 0 | 2 |
| src/services/music/core/index.ts | 2 | 0 | 0 | 2 |
| src/services/music/playback/PlaybackService.ts | 1 | 1 | 0 | 2 |
| src/services/music/queue/QueueService.ts | 1 | 1 | 0 | 2 |
| src/services/registry/CommandRegistry.ts | 1 | 1 | 0 | 2 |
| src/services/registry/EventRegistry.ts | 1 | 1 | 0 | 2 |
| src/services/registry/index.ts | 2 | 0 | 0 | 2 |
| src/types/moderation/automod.ts | 1 | 1 | 0 | 2 |
| src/types/music/events.ts | 0 | 2 | 0 | 2 |
| src/types/music/infrastructure.ts | 0 | 2 | 0 | 2 |
| src/types/music/track.ts | 0 | 2 | 0 | 2 |
| src/types/music/vote.ts | 0 | 2 | 0 | 2 |
| src/utils/common/apiUtils.ts | 0 | 2 | 0 | 2 |
| src/utils/common/pagination.ts | 0 | 2 | 0 | 2 |
| src/utils/music/index.ts | 0 | 2 | 0 | 2 |
| src/cache/CacheService.ts | 1 | 0 | 0 | 1 |
| src/cache/index.ts | 1 | 0 | 0 | 1 |
| src/cache/music/UserMusicCache.ts | 1 | 0 | 0 | 1 |
| src/commands/admin/ban.ts | 0 | 1 | 0 | 1 |
| src/commands/admin/kick.ts | 0 | 1 | 0 | 1 |
| src/commands/admin/mute.ts | 0 | 1 | 0 | 1 |
| src/commands/api/steam.ts | 1 | 0 | 0 | 1 |
| src/commands/general/avatar.ts | 1 | 0 | 0 | 1 |
| src/commands/general/help.ts | 1 | 0 | 0 | 1 |
| src/config/deathbattle/index.ts | 0 | 1 | 0 | 1 |
| src/config/features/moderation/automod.ts | 1 | 0 | 0 | 1 |
| src/config/features/moderation/filters.ts | 1 | 0 | 0 | 1 |
| src/config/features/moderation/punishments.ts | 1 | 0 | 0 | 1 |
| src/config/features/video.ts | 1 | 0 | 0 | 1 |
| src/core/CircuitBreaker.ts | 1 | 0 | 0 | 1 |
| src/core/Client.ts | 0 | 1 | 0 | 1 |
| src/core/Logger.ts | 1 | 0 | 0 | 1 |
| src/errors/ApiError.ts | 1 | 0 | 0 | 1 |
| src/errors/MusicError.ts | 1 | 0 | 0 | 1 |
| src/errors/VideoError.ts | 1 | 0 | 0 | 1 |
| src/events/BaseEvent.ts | 0 | 1 | 0 | 1 |
| src/events/messageCreate.ts | 0 | 1 | 0 | 1 |
| src/handlers/api/wikipediaHandler.ts | 1 | 0 | 0 | 1 |
| src/handlers/music/favoritesHandler.ts | 1 | 0 | 0 | 1 |
| src/handlers/music/historyHandler.ts | 1 | 0 | 0 | 1 |
| src/handlers/music/index.ts | 1 | 0 | 0 | 1 |
| src/handlers/music/settingsHandler.ts | 0 | 1 | 0 | 1 |
| src/handlers/music/trackHandler.ts | 1 | 0 | 0 | 1 |
| src/middleware/permissions.ts | 0 | 1 | 0 | 1 |
| src/repositories/api/index.ts | 1 | 0 | 0 | 1 |
| src/repositories/general/index.ts | 1 | 0 | 0 | 1 |
| src/repositories/moderation/index.ts | 1 | 0 | 0 | 1 |
| src/repositories/moderation/InfractionRepository.ts | 1 | 0 | 0 | 1 |
| src/repositories/moderation/ModLogRepository.ts | 1 | 0 | 0 | 1 |
| src/services/api/myAnimeListService.ts | 1 | 0 | 0 | 1 |
| src/services/api/steamService.ts | 1 | 0 | 0 | 1 |
| src/services/fun/deathbattle/SkillsetService.ts | 1 | 0 | 0 | 1 |
| src/services/fun/say/index.ts | 1 | 0 | 0 | 1 |
| src/services/fun/say/SayService.ts | 1 | 0 | 0 | 1 |
| src/services/guild/GuildSettingsService.ts | 0 | 1 | 0 | 1 |
| src/services/guild/index.ts | 1 | 0 | 0 | 1 |
| src/services/moderation/InfractionService.ts | 1 | 0 | 0 | 1 |
| src/services/music/core/MusicFacade.ts | 1 | 0 | 0 | 1 |
| src/services/music/events/index.ts | 1 | 0 | 0 | 1 |
| src/services/music/events/MusicEventBus.ts | 0 | 1 | 0 | 1 |
| src/services/music/playback/index.ts | 1 | 0 | 0 | 1 |
| src/services/music/queue/index.ts | 1 | 0 | 0 | 1 |
| src/services/music/spotify/index.ts | 1 | 0 | 0 | 1 |
| src/services/music/voice/index.ts | 1 | 0 | 0 | 1 |
| src/sharding.ts | 0 | 1 | 0 | 1 |
| src/utils/common/time.ts | 1 | 0 | 0 | 1 |
