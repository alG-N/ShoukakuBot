# Types Architecture Review

> Audit date: February 26, 2026  
> Total type definitions: ~380+ (interfaces, types, enums)  
> Files containing types: ~65  
> Dedicated type files: 4  
> Centralized `types/` folder: **None**

---

## Current State

Types are scattered across the entire codebase with **no centralized type organization**. Most files define their own interfaces inline, leading to:

- **Massive duplication** — some types are defined 4-6 times independently
- **Name collisions** — same type name with different shapes in different modules
- **`type Track = any`** stubs — 6 music handler files use this anti-pattern
- **Commands re-declare service interfaces** locally instead of importing

### Dedicated Type Files (only 4 exist)

| File | Purpose |
|------|---------|
| `services/music/core/MusicTypes.ts` | Music track, queue, playback types |
| `handlers/music/trackTypes.ts` | Music UI/embed types (overlaps with MusicTypes) |
| `handlers/moderation/AutoModTypes.ts` | AutoMod settings panel types |
| `config/deathbattle/skillsets/types.ts` | Deathbattle power/skillset types |

### Enums (only 2 in entire project)

Both live in `core/GracefulDegradation.ts`:
- `DegradationLevel`
- `ServiceState`

---

## Duplication Map

### Critical Duplications (3+ copies)

| Type | Copies | Locations |
|------|--------|-----------|
| `AutoModSettings` | 5 | `config/features/moderation/`, `AutoModService`, `AutoModHandler`, `AutoModTypes`, `AutoModRepository` |
| `ModerationConfig` | 5+ | `config/features/moderation/`, `AutoModTypes`, `ModerationService`, + multiple admin commands |
| `Infraction` | 5+ | `InfractionService`, `InfractionRepository`, `warn.ts`, `warnings.ts`, `delwarn.ts`, `case.ts` |
| `Track` | 4 | `MusicTypes.ts`, `trackTypes.ts`, `QueueCache.ts` (as `MusicTrack`), `MusicEvents.ts` |
| `ProgressData` | 5 | `YtDlpService`, `VideoProcessingService`, `VideoDownloadService`, `CobaltService`, `video.ts` command |
| `VideoConfigType` | 3 | `YtDlpService`, `VideoProcessingService`, `VideoDownloadService` |
| `NowPlayingOptions` | 3 | `MusicTypes`, `trackTypes`, `buttonHandler` |
| `VoteResult` | 3 | `VoteCache`, `controlHandler`, `buttonHandler` |
| `VoteSkipStatus` | 3 | `VoteCache`, `playHandler`, `buttonHandler` |
| `ModLogSettings` | 3 | `ModLogService`, `ModLogRepository`, `AntiRaidHandler` |
| `TrackInfo` | 3 | `MusicTypes`, `MusicEvents`, `utils/music/` |
| `PlayerLike` | 3 | `VoiceConnectionService`, `PlaybackService`, `PlaybackEventHandler` |
| `type Track = any` | 6 | `buttonHandler`, `controlHandler`, `playHandler`, `settingsHandler`, `historyHandler`, `favoritesHandler`, `queueHandler` |

### Name Collisions (same name, different shapes)

| Name | Location A | Location B |
|------|-----------|-----------|
| `ValidationResult` | `config/validation.ts` | `middleware/checks.ts`, admin commands |
| `SearchResult` | ~6 services (nhentai, rule34, pixiv, reddit, lavalink, wikipedia) |
| `SearchOptions` | ~4 services (pixiv, rule34, wikipedia, lavalink) |
| `ErrorCode` | `errors/AppError.ts` | `core/ErrorCodes.ts` |
| `ServiceOptions` | `container.ts` | `core/GracefulDegradation.ts` |
| `CacheStats` | `guild/RedisCache.ts` | `api/rule34Cache.ts` |
| `DownloadOptions` | `YtDlpService` | `VideoDownloadService`, `CobaltService` |

---

## Anti-Patterns Found

### 1. `type Track = any` Stub (6 files)

Music handlers define `type Track = any` instead of importing the real `Track` type:
```
handlers/music/buttonHandler.ts
handlers/music/controlHandler.ts
handlers/music/playHandler.ts
handlers/music/settingsHandler.ts
handlers/music/historyHandler.ts
handlers/music/favoritesHandler.ts
handlers/music/queueHandler.ts
```

**Fix:** Import `Track` from `services/music/core/MusicTypes.ts`.

### 2. Commands Re-declare Service Interfaces

Every command file re-defines non-exported interfaces that mirror the service types:

```typescript
// nhentai.ts (command) — local copy of service types
interface GalleryData { ... }
interface GalleryResult { ... }
interface NHentaiService { ... }

// video.ts (command) — local copy
interface VideoDownloadService { ... }
interface PlatformDetector { ... }
```

~15 command files do this. They should import from the actual service instead.

**Fix:** Export types from services and import in commands.

### 3. Repository-Service Type Duplication

Repositories and services define the same interfaces independently:

```
InfractionRepository.ts → interface Infraction (local)
InfractionService.ts    → interface Infraction (exported)
```

This applies to: `AutoModSettings`, `ModLogSettings`, `Infraction`, `Filter`, `NHentaiGallery`

**Fix:** Define once in a shared types file, import in both.

### 4. Handler-specific types duplicating handler/trackTypes

`nhentaiHandler.ts`, `rule34PostHandler.ts`, `pixivContentHandler.ts`, `animeHandler.ts`, etc. each define 8-15+ local interfaces for their API response shapes.

---

## Type Distribution by Module

```
commands/     — ~80 types (mostly local re-declarations of service types)
services/     — ~120 types (mix of exported + local, most duplication source)
handlers/     — ~80 types (many duplicated from services/cache)
config/       — ~35 types (well-organized, mostly exported)
core/         — ~40 types (well-organized)
cache/        — ~30 types (some exported, some duplicated in handlers)
middleware/   — ~12 types
repositories/ — ~35 types (mostly local, duplicate service types)
utils/        — ~20 types (all local)
errors/       — ~5 types
events/       — ~3 types
database/     — ~8 types
```

---

## Recommended Structure: `src/types/`

Create a centralized `src/types/` folder for **shared, cross-module types**. Keep truly local types in their files.

```
src/types/
├── index.ts                    # Barrel export
├── common.ts                   # Shared utility types (Result, ErrorDetails, etc.)
├── music/
│   ├── index.ts
│   ├── track.ts                # Track, TrackInfo, MusicTrack, LoopMode, SourcePlatform
│   ├── queue.ts                # MusicQueue, QueueState, AddTrackResult
│   ├── playback.ts             # PlayNextResult, SkipResult, NowPlayingOptions
│   ├── vote.ts                 # VoteResult, VoteSkipStatus, SkipVoteSession
│   └── events.ts               # MusicEventName, TrackEventData, etc.
├── video/
│   ├── index.ts
│   ├── processing.ts           # VideoAnalysis, ProcessingOptions, ProgressData, StageData
│   ├── download.ts             # DownloadOptions, DownloadResult, VideoConfigType
│   └── platform.ts             # PlatformConfig, PlatformInfo
├── moderation/
│   ├── index.ts
│   ├── automod.ts              # AutoModSettings, Violation, ActionType, ViolationType
│   ├── infraction.ts           # Infraction, InfractionType, EscalationResult
│   ├── filter.ts               # Filter, FilterMatch, FilterSettings
│   ├── modlog.ts               # ModLogSettings, ModActionType
│   └── lockdown.ts             # LockResult, ServerLockResult, LockdownState
├── api/
│   ├── index.ts
│   ├── nhentai.ts              # NHentaiGallery, GalleryResult, SearchData, etc.
│   ├── rule34.ts               # Rule34Post, SearchResults, PostRating, etc.
│   ├── reddit.ts               # RedditPost, SubredditInfo, etc.
│   ├── pixiv.ts                # PixivIllust, PixivSearchResult, etc.
│   ├── anime.ts                # AnimeMedia, AnimeFavourite, etc.
│   ├── steam.ts                # SteamGame, SteamSaleResponse, etc.
│   └── wikipedia.ts            # WikiArticle, WikiSearchResult, etc.
├── guild/
│   ├── index.ts
│   ├── settings.ts             # GuildSettings, GuildMusicSettings
│   └── shard.ts                # ShardMessage, ShardRequest, ShardResponse
├── cache/
│   ├── index.ts
│   └── cache.ts                # CacheMetrics, NamespaceConfig, CacheFactory
└── core/
    ├── index.ts
    ├── circuit.ts              # CircuitBreakerOptions, CircuitMetrics, CircuitHealth
    ├── degradation.ts          # DegradationLevel, ServiceState (enums)
    ├── error.ts                # ErrorCode, ErrorCategory, ErrorDetails
    └── logger.ts               # LogLevel, LogFormat, LogMetadata
```

### Migration Rules

| Current Pattern | Recommended |
|----------------|-------------|
| Type used in 1 file only | Keep in that file (local) |
| Type used across 2+ modules | Move to `src/types/` |
| `type X = any` stub | Replace with import from `src/types/` |
| Command re-declaring service interface | Import from `src/types/` |
| Repository duplicating service type | Import from `src/types/` |
| Config types (automod, filters, etc.) | Keep in `config/` — these are config shapes, not domain types |

### Migration Priority

1. **High** — `Track`, `AutoModSettings`, `Infraction`, `ModerationConfig` (most duplicated, most cross-module)
2. **High** — `ProgressData`, `VideoConfigType` (duplicated across 3-5 video files)
3. **Medium** — `VoteResult`, `VoteSkipStatus`, `NowPlayingOptions` (music handler duplication)
4. **Medium** — API response types (nhentai, rule34, pixiv, reddit, anime, steam, wikipedia)
5. **Low** — `type Track = any` stubs (quick fix, just change imports)
6. **Low** — Name collisions (`ValidationResult`, `SearchResult`, `SearchOptions`) — prefix with module name

### Import Convention

```typescript
// Good — import shared types from types/
import type { Track, LoopMode } from '../../types/music/track.js';
import type { AutoModSettings, Violation } from '../../types/moderation/automod.js';
import type { ProgressData, VideoConfigType } from '../../types/video/processing.js';

// Good — keep local-only types in the file
interface LocalState { ... }

// Bad — re-declaring service types locally
interface Track { title: string; ... }  // ❌ already exists in types/
type Track = any;                        // ❌ stub
```

---

## Summary

| Metric | Count |
|--------|-------|
| Total type definitions | ~380+ |
| Cross-module types (should be shared) | ~150 |
| Duplicated definitions | ~60 |
| Name collisions | ~12 |
| `type X = any` stubs | 6 |
| Command files with local service type copies | ~15 |
| Files that would need import changes | ~50-60 |

The project would benefit significantly from a `src/types/` folder. The current pattern of inline types works for small projects but at 380+ types across 65 files with 60+ duplications, it's creating maintenance burden and type inconsistency risks.
