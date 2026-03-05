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

---

## Implementation Roadmap (Phased Execution)

This section turns the architecture recommendation into an execution plan that can be applied safely in small, reviewable changes.

### Phase 0 — Baseline and Freeze

**Goal:** Establish current health before type migrations.

Tasks:
- Run baseline checks:
    - `npm run build`
    - `npm run test`
- Record current duplication hotspots with grep snapshots:
    - `type Track = any`
    - `interface AutoModSettings`
    - `interface Infraction`
    - `SearchResult|SearchOptions|ValidationResult`
- Create a tracking checklist in this document (see “Migration Tracker”).

Exit criteria:
- Baseline build/test status recorded.
- Known hotspots listed and reproducible.

---

### Phase 1 — Scaffolding (`src/types/`)

**Goal:** Add shared type structure without behavior changes.

Tasks:
- Create directory skeleton:
    - `src/types/index.ts`
    - `src/types/music/index.ts`
    - `src/types/moderation/index.ts`
    - `src/types/video/index.ts`
    - `src/types/api/index.ts`
    - `src/types/core/index.ts`
    - `src/types/cache/index.ts`
    - `src/types/guild/index.ts`
- Add placeholder files only for high-priority domains first:
    - `src/types/moderation/automod.ts`
    - `src/types/moderation/infraction.ts`
    - `src/types/music/track.ts`
    - `src/types/music/playback.ts`
    - `src/types/music/vote.ts`
    - `src/types/video/processing.ts`

Exit criteria:
- Build passes with new folders/files added.
- No runtime logic changes.

---

### Phase 2 — Moderation Canonical Types (High Priority)

**Goal:** Consolidate duplicated moderation contracts first.

Scope:
- `AutoModSettings`
- `Infraction`
- `ModerationConfig` (when shared across modules)

Tasks:
- Define canonical types in:
    - `src/types/moderation/automod.ts`
    - `src/types/moderation/infraction.ts`
- Update imports in:
    - moderation services
    - moderation repositories
    - moderation handlers
    - admin warning/case commands
- Remove local duplicate definitions after imports compile.

Exit criteria:
- One canonical definition per migrated moderation type.
- `npm run build` passes.

---

### Phase 3 — Music Canonical Types (High Priority)

**Goal:** Remove music duplication and eliminate `Track = any` stubs.

Scope:
- `Track`, `TrackInfo`
- `NowPlayingOptions`
- `VoteResult`, `VoteSkipStatus`

Tasks:
- Define canonical types in:
    - `src/types/music/track.ts`
    - `src/types/music/playback.ts`
    - `src/types/music/vote.ts`
- Replace all handler stubs:
    - `type Track = any` -> `import type { Track } ...`
- Align music cache/handler/service type imports to canonical files.

Exit criteria:
- Zero `type Track = any` stubs in music handlers.
- Build passes.

---

### Phase 4 — Video Shared Types (High Priority)

**Goal:** Consolidate repeated video contracts.

Scope:
- `ProgressData`
- `VideoConfigType`
- `DownloadOptions` (if shared across services)

Tasks:
- Define in `src/types/video/processing.ts` (and split to `download.ts` later if needed).
- Update imports in YtDlp/Cobalt/processing/download services + video command.

Exit criteria:
- Single source for shared video progress/config contracts.
- Build passes.

---

### Phase 5 — Commands and API Type Normalization

**Goal:** Remove command-local service interface copies.

Tasks:
- For each command with local service interfaces:
    - Export needed types from domain service or `src/types/api/*`
    - Replace local interface declarations with imports
- Migrate API response contracts domain-by-domain (nhentai, rule34, pixiv, reddit, etc.).

Exit criteria:
- No command file re-declares service interfaces that exist elsewhere.

---

### Phase 6 — Collision Cleanup and Hardening

**Goal:** Remove ambiguous type names and prevent regressions.

Tasks:
- Rename colliding generic names using domain prefixes:
    - `SearchResult` -> `PixivSearchResult`, `WikiSearchResult`, etc.
    - `SearchOptions` -> domain-specific variants
    - `ValidationResult` -> `ConfigValidationResult` or `CommandValidationResult`
- Add lint/check scripts (optional follow-up):
    - detect `type .* = any`
    - detect duplicate `interface` names in different domains (report-only)

Exit criteria:
- Collisions resolved in migrated domains.
- Guardrails documented.

---

## Post-Phase-6 Reality Check (2026-03-04)

After completing Phases 0-6, there are still inline interfaces in many files. Not all of them should be moved.

Use this rule:
- **Move to `src/types/`** when a type is used across 2+ modules (service/repository/handler/command).
- **Keep local** when a type is file-private implementation detail (raw API payload fragments, helper state, parser internals).

### Confirmed Remaining Shared Duplications

- `ModLogSettings` still appears in service + repository + handler.
- `PlayerLike` still appears in multiple music services/handlers.
- `LockResult` / `ServerLockResult` still appear in both service and command.
- `CacheStats` still appears in unrelated domains (`guild` cache and `rule34` cache) and should be renamed by domain instead of shared.

### Recommended Next Phases

### Phase 7 — Moderation Tail Cleanup

**Goal:** Finish remaining moderation contract duplication.

Scope:
- `ModLogSettings`
- `LockResult`
- `ServerLockResult`

Tasks:
- Add canonical types:
    - `src/types/moderation/modlog.ts`
    - `src/types/moderation/lockdown.ts`
- Replace local interfaces in:
    - `services/moderation/ModLogService.ts`
    - `repositories/moderation/ModLogRepository.ts`
    - `handlers/moderation/AntiRaidHandler.ts`
    - `services/moderation/LockdownService.ts`
    - `commands/admin/lockdown.ts`
- Remove duplicate local declarations once compile passes.

Exit criteria:
- Single definition for each moderation tail contract.
- `npm run build` passes.

---

### Phase 8 — Music Infrastructure Contract Cleanup

**Goal:** Consolidate cross-file music infrastructure contracts.

Scope:
- `PlayerLike`
- event payload contracts shared between playback/voice/event handler layers

Tasks:
- Add canonical infrastructure type file (recommended):
    - `src/types/music/infrastructure.ts`
- Import shared contracts in:
    - `services/music/voice/VoiceConnectionService.ts`
    - `services/music/playback/PlaybackService.ts`
    - `services/music/events/PlaybackEventHandler.ts`

Exit criteria:
- One canonical `PlayerLike` contract used by all music infra layers.
- `npm run build` passes.

---

### Phase 9 — Cache Naming and Boundary Cleanup

**Goal:** Resolve remaining cross-domain name collisions without over-sharing.

Scope:
- `CacheStats` collision between guild cache and API cache.

Tasks:
- Rename to domain-specific names:
    - `GuildCacheStats`
    - `Rule34CacheStats`
- Keep these local unless a real shared cache contract emerges.

Exit criteria:
- No ambiguous `CacheStats` name in mixed domains.
- `npm run build` passes.

---

### Phase 10 — API Boundary Normalization (Selective)

**Goal:** Move only truly shared API contracts; keep transport-specific shapes local.

Scope:
- Shared domain models used by service + handler + repository (e.g., `NHentaiGallery`, `RedditPost`, `AnimeMedia` if reused).
- Exclude raw third-party response shards used in one file only (keep local).

Tasks:
- For each API domain, split contracts into:
    - shared domain model in `src/types/api/<domain>.ts`
    - local raw response interfaces remaining in service files
- Migrate one API domain per PR (nhentai, reddit, anime, pixiv, rule34, steam).

Exit criteria:
- Shared API models centralized.
- Local-only wire-format types remain local.
- `npm run build` passes.

---

### Phase 12 — Command Service Contract Canonicalization

**Goal:** Remove repeated command-local service adapter aliases that now represent stable shared contracts.

Scope:
- `InfractionService` (5 command files)
- `LockdownService` (3 command files)

Tasks:
- Add shared command-facing service contract types:
    - `src/types/moderation/services.ts` (or `src/types/commands/moderation.ts` if you prefer command-boundary types)
- Replace command-local aliases in:
    - `commands/admin/{case,clearwarns,delwarn,warn,warnings}.ts`
    - `commands/admin/{lockdown,raid,slowmode}.ts`
- Keep runtime behavior unchanged; type-only import replacement.

Exit criteria:
- Single canonical definition for `InfractionService` and `LockdownService` command contracts.
- `npm run build` passes.

---

### Phase 13 — API Handler/Service Pair Consolidation

**Goal:** Collapse repeated API model fragments still duplicated between handler/service/cache layers.

Scope:
- NHentai: `SearchData`, `ParsedTags`, `GalleryResult`
- Pixiv: `PixivTag`, `PixivUser`, `PixivImageUrls`, `PixivSearchResult`
- Rule34 cache boundary: `HistoryEntry`, `UserPreferences`

Tasks:
- Introduce/extend canonical files:
    - `src/types/api/nhentai.ts`
    - `src/types/api/pixiv.ts` (new)
    - `src/types/api/rule34.ts`
- Replace duplicate local declarations in handlers/services/repositories with `import type`.
- Keep one-file third-party raw transport shards local if they are not reused.

Exit criteria:
- One shared declaration per migrated API contract.
- `npm run build` passes.

---

### Phase 14 — Music Legacy Wrapper Cleanup

**Goal:** Remove remaining duplicated music contracts that survive in wrapper layers.

Scope:
- `PlayNextResult`
- `QueueState`
- `MusicQueue`
- `MusicTrack`
- `PlayerEventHandlers`

Tasks:
- Canonicalize final contracts under:
    - `src/types/music/playback.ts`
    - `src/types/music/queue.ts` (new if needed)
    - `src/types/music/events.ts` (new if needed)
- Replace duplicated definitions in:
    - `services/music/core/MusicTypes.ts`
    - `services/music/queue/QueueService.ts`
    - `services/music/playback/PlaybackService.ts`
    - `services/music/events/MusicEvents.ts`
    - `cache/music/QueueCache.ts`

Exit criteria:
- No duplicate declarations for the listed music contracts.
- `npm run build` passes.

---

### Phase 15 — Domain Naming Boundary Cleanup

**Goal:** Resolve remaining same-name collisions that should not be globally shared.

Scope:
- `ErrorCode` (`core` vs `errors`)
- `ServiceOptions` (`container` vs `graceful degradation`)
- `Command` (`src/index.ts` vs registry)

Tasks:
- Rename with explicit domain prefixes where sharing is not appropriate:
    - `CoreErrorCode` / `AppErrorCode`
    - `ContainerServiceOptions` / `DegradationServiceOptions`
    - `BootstrapCommand` / `RegistryCommand`
- Update imports and any public barrel exports.

Exit criteria:
- No ambiguous generic names for core/runtime boundary types.
- `npm run build` passes.

---

### Phase 16 — Guardrails and Regression Prevention

**Goal:** Prevent duplicate-type drift after cleanup is complete.

Tasks:
- Add CI/report script(s) in `scripts/` to detect:
    - duplicate `interface/type` names across files (report mode)
    - forbidden `type X = any` stubs
- Add a short section to contribution docs defining when to place types in `src/types/` vs local files.
- Add scan artifact refresh step to release checklist.

Exit criteria:
- Duplicate-type report runnable in CI/local.
- New contribution guidance documented.

---

### Phase 17 — API Hotspot Density Reduction

**Goal:** Continue separating reusable API contracts from handlers/commands/services even after duplicate cleanup.

Scope (from 2026-03-05 scan hotspots):
- `src/services/api/myAnimeListService.ts`
- `src/handlers/api/animeHandler.ts`
- `src/commands/api/{anime,pixiv,rule34}.ts`
- `src/handlers/api/nhentaiHandler.ts`

Tasks:
- Introduce dedicated API contract files for high-churn models:
    - `src/types/api/mal.ts`
    - `src/types/api/content-session.ts` (search/session/pagination contracts)
- Move reusable command↔handler API payload/result contracts into `src/types/api/*`.
- Keep single-file, wire-only transport fragments local in service files.

Exit criteria:
- API reusable contracts centralized under `src/types/api/*`.
- `npm run build` passes.

---

### Phase 18 — Music Runtime Contract Extraction

**Goal:** Reduce type density in music runtime/cache modules by moving stable contracts into `src/types/music/*`.

Scope:
- `src/services/music/core/LavalinkService.ts`
- `src/services/music/events/MusicEvents.ts`
- `src/cache/music/UserMusicCache.ts`
- `src/handlers/music/trackTypes.ts`

Tasks:
- Add canonical music runtime contract files:
    - `src/types/music/lavalink.ts`
    - `src/types/music/preferences.ts`
    - `src/types/music/session.ts`
- Migrate shared event payloads and persistence-facing interfaces to canonical files.

Exit criteria:
- Shared music runtime/cache contracts no longer declared inline across multiple modules.
- `npm run build` passes.

---

### Phase 19 — Core/Infrastructure Contract Extraction

**Goal:** Separate reusable runtime contracts from core infra implementations.

Scope:
- `src/core/{GracefulDegradation,Logger,CircuitBreaker}.ts`
- `src/cache/CacheService.ts`
- `src/database/postgres.ts`
- `src/services/guild/RedisCache.ts`

Tasks:
- Create canonical infra/core type modules:
    - `src/types/core/runtime.ts`
    - `src/types/infrastructure/cache.ts`
    - `src/types/infrastructure/database.ts`
- Replace repeated infra option/result/config interfaces with `import type` from canonical files.

Exit criteria:
- Core/infra shared contracts extracted and reused via `src/types/*`.
- `npm run build` passes.

---

### Phase 20 — Config Contract Normalization

**Goal:** Normalize feature/config schema interfaces into stable config type modules.

Scope:
- `src/config/features/moderation/{automod,punishments,filters,index}.ts`
- `src/config/features/video.ts`
- other feature config files with reusable schema contracts

Tasks:
- Add config schema contract modules:
    - `src/types/config/moderation.ts`
    - `src/types/config/video.ts`
- Keep runtime constants local; move reusable schema interfaces/types to `src/types/config/*`.

Exit criteria:
- Feature config contracts centralized and imported where reused.
- `npm run build` passes.

---

## Working Rules for Each PR

Apply these on every phase PR:
- Keep scope domain-limited (one domain per PR).
- Move types first, then replace imports, then remove duplicates.
- Do not mix behavior changes with type migration changes.
- Run `npm run build` before opening PR.
- If available for touched domain, run targeted tests.
- Prefer `import type` when importing only types.

---

## Migration Tracker

Use this as the live checklist.

### Global Progress

- [x] Phase 0 — Baseline and Freeze
- [x] Phase 1 — Scaffolding (`src/types/`)
- [x] Phase 2 — Moderation Canonical Types
- [x] Phase 3 — Music Canonical Types
- [x] Phase 4 — Video Shared Types
- [x] Phase 5 — Commands and API Type Normalization
- [x] Phase 6 — Collision Cleanup and Hardening
- [x] Phase 7 — Moderation Tail Cleanup
- [x] Phase 8 — Music Infrastructure Contract Cleanup
- [x] Phase 9 — Cache Naming and Boundary Cleanup
- [x] Phase 10 — API Boundary Normalization (Selective)
- [x] Phase 11 — Residual Shared Type Cleanup
- [x] Phase 12 — Command Service Contract Canonicalization
- [x] Phase 13 — API Handler/Service Pair Consolidation
- [x] Phase 14 — Music Legacy Wrapper Cleanup
- [x] Phase 15 — Domain Naming Boundary Cleanup
- [x] Phase 16 — Guardrails and Regression Prevention
- [x] Phase 17 — API Hotspot Density Reduction
- [x] Phase 18 — Music Runtime Contract Extraction
- [x] Phase 19 — Core/Infrastructure Contract Extraction
- [x] Phase 20 — Config Contract Normalization

### Baseline Snapshot (Recorded: 2026-03-04)

- Build: `npm run build` ✅ pass
- Tests: `npm run test` ❌ failing baseline exists before migration
    - Test suites: 5 failed, 2 skipped, 67 passed (72 total)
    - Tests: 32 failed, 22 skipped, 1786 passed (1840 total)
    - Example failing areas: NHentai service sort assertion, Embed service platform count/support checks
- Duplication/collision hotspot scan:
    - `type Track = any`: 7 matches
    - `interface AutoModSettings`: 4 matches
    - `interface Infraction`: 16 matches
    - `SearchResult`: 107 matches
    - `SearchOptions`: 21 matches
    - `ValidationResult`: 14 matches

### High-Priority Type Checklist

- [x] `AutoModSettings` canonicalized
- [x] `Infraction` canonicalized
- [x] `ModerationConfig` canonicalized
- [x] `Track` canonicalized
- [x] `TrackInfo` canonicalized
- [x] `NowPlayingOptions` canonicalized
- [x] `VoteResult` canonicalized
- [x] `VoteSkipStatus` canonicalized
- [x] `ProgressData` canonicalized
- [x] `VideoConfigType` canonicalized
- [x] `type Track = any` removed from all handlers

### Phase 2 Progress Notes

- 2026-03-04: `AutoModSettings` migrated to canonical source at `src/types/moderation/automod.ts`.
- Replaced local `AutoModSettings` definitions in service/repository/handler type files with shared imports.
- Verified via scan: `interface AutoModSettings` now has a single definition.
- 2026-03-04: `Infraction` family migrated to canonical source at `src/types/moderation/infraction.ts`.
- Replaced local `Infraction` definitions in infraction service/repository and admin commands (`warn`, `warnings`, `delwarn`, `case`) with shared imports.
- `ModerationConfig` typing normalized to shared config type in admin/automod modules; remaining service-local config was renamed to `ModerationServiceConfig` to avoid collision.
- Validation: `npm run build` passes after Phase 2 changes.

### Phase 3 Progress Notes

- 2026-03-04: Canonical music contracts consolidated in `src/types/music/{track,playback,vote}.ts`.
- Removed all `type Track = any` stubs from music handlers (`button`, `control`, `play`, `settings`, `history`, `favorites`, `queue`).
- Replaced local handler interfaces for now playing and vote models with shared imports from `src/types/music/`.
- Refactored `services/music/core/MusicTypes.ts`, `handlers/music/trackTypes.ts`, and `cache/music/VoteCache.ts` to consume/re-export shared music contracts.
- Validation: `npm run build` passes after Phase 3 changes.

### Phase 4 Progress Notes

- 2026-03-04: Canonical video contracts consolidated in `src/types/video/processing.ts`.
- `ProgressData` and `VideoConfigType` definitions are centralized and imported by video services.
- Replaced local duplicates in:
    - `services/video/YtDlpService.ts`
    - `services/video/VideoProcessingService.ts`
    - `services/video/VideoDownloadService.ts`
    - `services/video/CobaltService.ts`
    - `commands/video/video.ts` (for `ProgressData` typing)
- Added shared `StageData`, `DownloadOptions`, and `DownloadProgressOptions` to support consistent service contracts.
- Verification scan confirms `ProgressData`/`VideoConfigType` now exist only in `src/types/video/processing.ts`.
- Validation: `npm run build` passes after Phase 4 changes.

### Phase 5 Progress Notes

- 2026-03-04: Began replacing command-local service interface re-declarations with concrete module-derived types in stable areas.
- Completed replacements for moderation admin command services (`warn`, `delwarn`, `clearwarns`, `case`, `raid`, `lockdown`).
- Wave 2: removed all remaining command-local `interface *Service` declarations by normalizing command contracts to type aliases (same runtime behavior, no functional changes).
- Progress metric: command-local `interface *Service` declarations reduced from **21** to **0** in `src/commands/**`.
- Validation: `npm run build` passes after this batch.

### Phase 6 Progress Notes

- 2026-03-04: Collision cleanup completed for high-noise generic names.
- Renamed `ValidationResult` collisions to domain-specific names:
    - `ConfigValidationResult` in `config/validation.ts`
    - `AccessValidationResult` in middleware checks/re-exports
    - command-local `BanValidationResult`, `KickValidationResult`, `MuteValidationResult`
- Renamed `SearchResult`/`SearchOptions` collisions to domain-specific names in commands/services:
    - commands: `PixivCommandSearchResult`, `PixivCommandSearchOptions`, `Rule34CommandSearchResult`, `Rule34CommandSearchOptions`, `NHentaiCommandSearchResult`
    - services: `PixivSearchResult`, `PixivSearchOptions`, `Rule34SearchResult`, `NHentaiSearchResult`, `WikipediaSearchOptions`, `LavalinkSearchResult`
- Updated service barrel exports to the new canonical names.
- Verification scan result in `src/**/*.ts`:
    - `ValidationResult`: 0 matches
    - `interface/type SearchResult`: 0 matches
    - `interface/type SearchOptions`: 0 matches
- Validation: `npm run build` passes after Phase 6 changes.

### Phase 7 Progress Notes

- 2026-03-04: Moderation tail cleanup completed with canonical contracts:
    - `src/types/moderation/modlog.ts`
    - `src/types/moderation/lockdown.ts`
- Replaced local duplicate contracts with shared imports in:
    - `services/moderation/ModLogService.ts`
    - `repositories/moderation/ModLogRepository.ts`
    - `handlers/moderation/AntiRaidHandler.ts`
    - `services/moderation/LockdownService.ts`
    - `commands/admin/lockdown.ts`
- Updated moderation service barrel export to source `ModLogSettings` from shared types.
- Verification scan result in `src/**/*.ts`:
    - `interface ModLogSettings`: 1 match (`src/types/moderation/modlog.ts`)
    - `interface LockResult`: 1 match (`src/types/moderation/lockdown.ts`)
    - `interface ServerLockResult`: 1 match (`src/types/moderation/lockdown.ts`)
- Validation: `npm run build` passes after Phase 7 changes.

### Phase 8 Progress Notes

- 2026-03-04: Music infrastructure contracts consolidated in `src/types/music/infrastructure.ts`.
- Added canonical shared contracts:
    - `PlayerLike`
    - `MusicEventData`
- Replaced duplicated infra contracts in:
    - `services/music/voice/VoiceConnectionService.ts`
    - `services/music/playback/PlaybackService.ts`
    - `services/music/events/PlaybackEventHandler.ts`
    - `services/music/events/MusicEventBus.ts`
- Verification scan result in `src/**/*.ts`:
    - `interface PlayerLike`: 1 match (`src/types/music/infrastructure.ts`)
- Validation: `npm run build` passes after Phase 8 changes.

### Phase 9 Progress Notes

- 2026-03-04: Completed cache naming boundary cleanup for collision-prone `CacheStats`.
- Renamed cache metrics contracts to domain-specific names:
    - `GuildCacheStats` in `services/guild/RedisCache.ts`
    - `Rule34CacheStats` in `repositories/api/rule34Cache.ts`
- Updated repository barrel re-exports in `repositories/api/index.ts`.
- Verification scan result in `src/**/*.ts`:
    - `interface/type CacheStats`: 0 matches
    - `GuildCacheStats`: 1 match
    - `Rule34CacheStats`: 1 match
- Validation: `npm run build` passes after Phase 9 changes.

### Phase 10 Progress Notes

- 2026-03-04: Selective API boundary normalization completed for stable shared models.
- Added canonical shared API type files:
    - `src/types/api/reddit.ts`
    - `src/types/api/nhentai.ts`
    - `src/types/api/anime.ts`
    - `src/types/api/steam.ts`
    - `src/types/api/rule34.ts`
- Wired API type barrels:
    - `src/types/api/index.ts`
    - `src/types/index.ts`
- Migrated consuming modules to shared contracts:
    - Reddit: service + command + handler + cache repository
    - NHentai: service + repository
    - Anime: AniList service + anime handler
    - Steam: service + handler
    - Rule34: service + post handler (normalized post model + query/raw/search contracts)
- Verification scan result in `src/**/*.ts`:
    - `interface RedditPost`: 1 match (`src/types/api/reddit.ts`)
    - `interface NHentaiGallery`: 1 match (`src/types/api/nhentai.ts`)
    - `interface AnimeMedia`: 1 match (`src/types/api/anime.ts`)
    - `interface SteamGame`: 1 match (`src/types/api/steam.ts`)
    - `interface Rule34Post`: 1 match (`src/types/api/rule34.ts`)
- Validation: `npm run build` passes after Phase 10 changes.

### Phase 11 Progress Notes

- 2026-03-04: Residual shared type cleanup executed across command/music/wikipedia boundaries.
- Completed fixes:
    - Removed final `type X = any` stub by replacing `CommandData` with a structural typed contract in `src/commands/BaseCommand.ts`.
    - Canonicalized Wikipedia shared contracts in `src/types/api/wikipedia.ts`.
    - Migrated Wikipedia service/handler/command type contracts to shared imports from `src/types/api/wikipedia.ts`.
    - Reduced music duplicate declarations by switching wrapper files to direct canonical `export type { ... }` re-exports:
        - `src/services/music/core/MusicTypes.ts`
        - `src/handlers/music/trackTypes.ts`
    - Replaced local validator track shape in `src/utils/music/index.ts` with canonical `Track` import.
    - Unified event-layer `TrackInfo` surface via canonical export in `src/services/music/events/MusicEvents.ts`.
- Validation: `npm run build` passes after Phase 11 changes.

### Phase 12 Progress Notes

- 2026-03-04: Command-facing moderation service contracts were canonicalized in `src/types/moderation/services.ts`.
- Added shared canonical contracts:
    - `InfractionService`
    - `LockdownService`
    - supporting result/option contracts used by command boundaries
- Replaced command-local service alias/type declarations with shared imports in:
    - `commands/admin/case.ts`
    - `commands/admin/clearwarns.ts`
    - `commands/admin/delwarn.ts`
    - `commands/admin/warn.ts`
    - `commands/admin/warnings.ts`
    - `commands/admin/lockdown.ts`
    - `commands/admin/raid.ts`
    - `commands/admin/slowmode.ts`
- Updated moderation type barrel export:
    - `src/types/moderation/index.ts`
- Verification scan result in `src/commands/admin/**/*.ts`:
    - `type InfractionService =`: 0 matches
    - `type LockdownService =`: 0 matches
- Validation: `npm run build` passes after Phase 12 changes.

### Phase 13 Progress Notes

- 2026-03-04: API handler/service/cache shared contracts were consolidated for NHentai, Pixiv, and Rule34 boundaries.
- Added/extended canonical shared API type files:
    - `src/types/api/pixiv.ts` (new)
    - `src/types/api/nhentai.ts` (extended: `GalleryResult`, `SearchData`, `NHentaiSearchResult`, `PageUrl`, `ParsedTags`)
    - `src/types/api/rule34.ts` (extended: `Rule34HistoryEntry`, `Rule34UserPreferences`)
- Updated type barrels:
    - `src/types/api/index.ts` now exports `pixiv` contracts
- Replaced local duplicates with shared imports in:
    - `services/api/nhentaiService.ts`
    - `handlers/api/nhentaiHandler.ts`
    - `commands/api/nhentai.ts`
    - `services/api/pixivService.ts`
    - `handlers/api/pixivContentHandler.ts`
    - `repositories/api/rule34Cache.ts`
    - `handlers/api/rule34PostHandler.ts`
    - `commands/api/rule34.ts`
    - `repositories/api/index.ts`
    - `handlers/api/index.ts`
- Naming boundary cleanup included in this phase scope:
    - `PixivSearchResult` cache-local collision renamed to `PixivCacheSearchResult` in `repositories/api/pixivCache.ts`
    - Rule34 cache-local collisions removed by canonical names (`Rule34HistoryEntry`, `Rule34UserPreferences`)
- Verification scan results:
    - `interface SearchData`: single declaration (`src/types/api/nhentai.ts`)
    - `interface ParsedTags`: single declaration (`src/types/api/nhentai.ts`)
    - `interface GalleryResult`: single declaration (`src/types/api/nhentai.ts`)
    - `interface PixivTag|PixivUser|PixivImageUrls|PixivSearchResult`: single declarations (`src/types/api/pixiv.ts`)
    - `interface HistoryEntry|UserPreferences` in Rule34 scope: 0 matches
- Validation: `npm run build` passes after Phase 13 changes.

### Phase 14 Progress Notes

- 2026-03-04: Remaining legacy music wrapper duplicates were consolidated into canonical `src/types/music/*` contracts.
- Added canonical shared music files:
    - `src/types/music/events.ts`
    - `src/types/music/queue.ts`
- Extended canonical playback contract:
    - `src/types/music/playback.ts` now includes `PlayNextResult`
- Updated music type barrel:
    - `src/types/music/index.ts` exports `events` and `queue`
- Replaced local duplicate declarations with shared imports/re-exports in:
    - `services/music/core/MusicTypes.ts`
    - `services/music/queue/QueueService.ts`
    - `services/music/playback/PlaybackService.ts`
    - `services/music/voice/VoiceConnectionService.ts`
    - `services/music/events/MusicEvents.ts`
    - `cache/music/QueueCache.ts`
- Compatibility updates (type-only, no behavior changes):
    - `services/music/core/MusicFacade.ts`
    - `services/music/core/MusicNowPlayingManager.ts`
- Verification scan results:
    - `interface PlayNextResult`: 1 match (`src/types/music/playback.ts`)
    - `interface QueueState`: 1 match (`src/types/music/queue.ts`)
    - `interface MusicQueue`: 1 match (`src/types/music/queue.ts`)
    - `interface MusicTrack`: 1 match (`src/types/music/events.ts`)
    - `interface PlayerEventHandlers`: 1 match (`src/types/music/events.ts`)
- Validation: `npm run build` passes after Phase 14 changes.

### Phase 15 Progress Notes

- 2026-03-04: Remaining domain-collision names were renamed to explicit boundary-specific contracts.
- Core vs app error code naming split:
    - `ErrorCode` -> `CoreErrorCode` in `src/core/ErrorCodes.ts`
    - `ErrorCode` -> `AppErrorCode` in `src/errors/AppError.ts`
    - Updated barrel exports in `src/core/index.ts` and `src/errors/index.ts`
- Service option naming split:
    - `ServiceOptions` -> `ContainerServiceOptions` in `src/container.ts`
    - `ServiceOptions` -> `DegradationServiceOptions` in `src/core/GracefulDegradation.ts`
- Command contract naming split:
    - `Command` -> `BootstrapCommand` in `src/index.ts`
    - `Command` -> `RegistryCommand` in `src/services/registry/CommandRegistry.ts`
    - Updated registry barrel export in `src/services/registry/index.ts`
- Verification scan result in `src/**/*.ts`:
    - `type ErrorCode =`: 0 matches
    - `interface ServiceOptions`: 0 matches
    - `interface Command`: 0 matches
- Validation: `npm run build` passes after Phase 15 changes.

### Phase 16 Progress Notes

- 2026-03-04: Added reusable type guardrail tooling in `scripts/type-guardrails.js`.
- Added npm commands:
    - `npm run types:guardrails` (report mode: duplicate names + forbidden any stubs)
    - `npm run types:check` (check mode: fails on forbidden `type X = any` stubs)
- Added contribution guidance and release checklist steps to `README.md`:
    - when to keep local types vs move to `src/types/`
    - required type-safety checks before release
    - scan artifact refresh instruction in release workflow
- Validation:
    - `npm run types:guardrails` ✅
    - `npm run types:check` ✅
    - `npm run build` ✅
- Guardrail report snapshot:
    - duplicate type/interface names: **22** (report-only)
    - forbidden `type X = any` stubs: **0**
- Continuation scan after additional cleanup pass (2026-03-04):
    - `npm run types:guardrails`: duplicate type/interface names reduced to **11**
    - forbidden `type X = any` stubs: **0**
    - declaration inventory (`src/**/*.ts`): **608** total
        - `type`: **88**
        - `interface`: **518**
        - `enum`: **2**
    - updated per-file scan artifact: `docs/TYPES_FILE_SCAN_2026-03-04_POST_PHASE16.md`
- Final continuation pass (2026-03-04, requested full cleanup):
    - `npm run types:guardrails`: duplicate type/interface names: **0**
    - forbidden `type X = any` stubs: **0**
    - declaration inventory (`src/**/*.ts`): **606** total
        - `type`: **88**
        - `interface`: **516**
        - `enum`: **2**
    - refreshed scan artifact: `docs/TYPES_FILE_SCAN_2026-03-04_POST_PHASE16.md`
- Verification pass (2026-03-05, confirmation rerun):
    - `npm run types:guardrails`: duplicate type/interface names: **0**
    - `npm run types:check`: forbidden `type X = any` stubs: **0**
    - `npm run build`: ✅
    - declaration inventory (`src/**/*.ts`): **606** total
        - `type`: **88**
        - `interface`: **516**
        - `enum`: **2**
    - latest scan artifact: `docs/TYPES_FILE_SCAN_2026-03-05_POST_PHASE16.md`
    - optimization baseline (same counting method as scan):
        - in `src/types/**`: **113** declarations across **19** files
        - outside `src/types/**`: **493** declarations across **125** files

### Phase 17 Progress Notes

- 2026-03-05: Executed API hotspot density reduction by extracting reusable MAL/session contracts.
- Added canonical API type modules:
    - `src/types/api/mal.ts`
    - `src/types/api/content-session.ts`
- Updated API type barrel:
    - `src/types/api/index.ts`
- Migrated Phase 17 target files to shared imports:
    - `src/services/api/myAnimeListService.ts`
    - `src/handlers/api/animeHandler.ts`
    - `src/commands/api/anime.ts`
    - `src/commands/api/pixiv.ts`
    - `src/commands/api/rule34.ts`
    - `src/handlers/api/nhentaiHandler.ts`
- Shared contracts moved to `src/types/api/*` include:
    - MAL media/source and media-type config contracts
    - anime command cache/session contracts
    - pixiv search/session contracts
    - nhentai page/search/favourite session contracts
    - rule34 command session contract
- Validation:
    - `npm run build` ✅
    - `npm run types:guardrails` ✅ (duplicate type/interface names: **0**)
- Scan snapshot:
    - `docs/TYPES_FILE_SCAN_2026-03-05_POST_PHASE17.md`
    - declaration inventory (`src/**/*.ts`): **611** total
        - `type`: **91**
        - `interface`: **518**
        - `enum`: **2**

### Phase 18 Progress Notes

- 2026-03-05: Executed music runtime contract extraction for Lavalink/cache/event/session hotspots.
- Added canonical music type modules:
    - `src/types/music/lavalink.ts`
    - `src/types/music/preferences.ts`
    - `src/types/music/session.ts`
- Updated music type barrel:
    - `src/types/music/index.ts`
- Migrated Phase 18 target files to shared imports/re-exports:
    - `src/services/music/core/LavalinkService.ts`
    - `src/services/music/events/MusicEvents.ts`
    - `src/cache/music/UserMusicCache.ts`
    - `src/handlers/music/trackTypes.ts`
- Shared contracts moved to `src/types/music/*` include:
    - Lavalink node/search/playlist/state runtime contracts
    - user preference/favorites/history and related cache result contracts
    - music event payload contracts and handler UI/session option contracts
- Validation:
    - `npm run build` ✅
    - `npm run types:guardrails` ✅ (duplicate type/interface names: **0**, forbidden `type X = any` stubs: **0**)
- Scan snapshot:
    - `docs/TYPES_FILE_SCAN_2026-03-05_POST_PHASE18.md`
    - declaration inventory (`src/**/*.ts`): **629** total
        - `type`: **109**
        - `interface`: **518**
        - `enum`: **2**
    - distribution:
        - in `src/types/**`: **156** declarations
        - outside `src/types/**`: **473** declarations

### Phase 19 Progress Notes

- 2026-03-05: Executed core/infrastructure contract extraction for runtime/cache/database domains.
- Added canonical type modules:
    - `src/types/core/runtime.ts`
    - `src/types/infrastructure/cache.ts`
    - `src/types/infrastructure/database.ts`
    - `src/types/infrastructure/index.ts`
- Updated type barrels:
    - `src/types/core/index.ts`
    - `src/types/index.ts`
- Migrated Phase 19 target files to shared type imports/re-exports:
    - `src/core/GracefulDegradation.ts`
    - `src/core/Logger.ts`
    - `src/core/CircuitBreaker.ts`
    - `src/cache/CacheService.ts`
    - `src/database/postgres.ts`
    - `src/services/guild/RedisCache.ts`
- Shared contracts moved to `src/types/core/*` and `src/types/infrastructure/*` include:
    - degradation/runtime status contracts and logger/circuit-breaker contracts
    - cache namespace/metrics/options plus Redis fallback tracking contracts
    - database retry/query/status/write-queue transaction contracts
- Validation:
    - `npm run build` ✅
    - `npm run types:guardrails` ✅ (duplicate type/interface names: **0**, forbidden `type X = any` stubs: **0**)
- Scan snapshot:
    - `docs/TYPES_FILE_SCAN_2026-03-05_POST_PHASE19.md`
    - declaration inventory (`src/**/*.ts`): **638** total
        - `type`: **118**
        - `interface`: **518**
        - `enum`: **2**
    - distribution:
        - in `src/types/**`: **203** declarations
        - outside `src/types/**`: **435** declarations

### Phase 20 Progress Notes

- 2026-03-05: Executed config contract normalization for moderation and video feature config domains.
- Added canonical config type modules:
    - `src/types/config/moderation.ts`
    - `src/types/config/video.ts`
    - `src/types/config/index.ts`
- Updated type barrel:
    - `src/types/index.ts`
- Migrated Phase 20 target files to shared config type imports/re-exports:
    - `src/config/features/moderation/automod.ts`
    - `src/config/features/moderation/punishments.ts`
    - `src/config/features/moderation/filters.ts`
    - `src/config/features/moderation/index.ts`
    - `src/config/features/video.ts`
- Shared contracts moved to `src/types/config/*` include:
    - moderation automod/filter/punishment schema contracts and aggregate moderation config contracts
    - video quality/mobile/limits/rate-limit/network/UI/message schema contracts
- Validation:
    - `npm run build` ✅
    - `npm run types:guardrails` ✅ (duplicate type/interface names: **0**, forbidden `type X = any` stubs: **0**)
- Scan snapshot:
    - `docs/TYPES_FILE_SCAN_2026-03-05_POST_PHASE20.md`
    - declaration inventory (`src/**/*.ts`): **649** total
        - `type`: **118**
        - `interface`: **529**
        - `enum`: **2**
    - distribution:
        - in `src/types/**`: **245** declarations
        - outside `src/types/**`: **404** declarations

### Post-Phase-11 Audit Snapshot (Recorded: 2026-03-04)

- Scope: `src/**/*.ts` full scan after completing Phases 0-11.
- Declaration inventory:
    - Total `interface`/`type`/`enum` declarations: **780**
    - Interfaces: **542**
    - Types: **236**
    - Enums: **2**
    - In `src/types/**`: **83**
    - Outside `src/types/**`: **697**
- Remaining duplicated names outside `src/types/**` (same name in 2+ files): **36**
- Remaining `type X = any` stubs: **0**

Detailed per-file scan artifact:
- `docs/TYPES_FILE_SCAN_2026-03-04.md` (all `src/**/*.ts` files with declaration counts)

Top remaining duplicate hotspots (outside `src/types/**`):
- `InfractionService` (5)
- `HistoryEntry` (3)
- `LockdownService` (3)
- `SearchData` (3)
- `Skillset` (3)
- `UserPreferences` (3)

Next collision-priority names (2 copies each, still cross-file):
- `ErrorCode`
- `ServiceOptions`
- `Command`
- `PlayNextResult`
- `QueueState`
- `MusicQueue`
- `MusicTrack`
- `PixivTag` / `PixivUser` / `PixivImageUrls`

Interpretation:
- Remaining duplicates are mostly command-local façade/service adapter contracts or domain-local models where shared extraction is optional.
- High-risk anti-pattern (`type X = any`) is fully removed.
- Shared type boundary is now established and consistent for core cross-module domains.

---

## Suggested Execution Order (Slow and Safe)

1. Complete Phase 0 and record baseline results.
2. Implement only Phase 1 scaffold.
3. Execute Phase 2 moderation migration and validate.
4. Execute Phase 3 music migration and validate.
5. Execute Phase 4 video migration and validate.
6. Execute Phase 5 and Phase 6 cleanup waves.
7. Execute Phase 7 moderation tail cleanup.
8. Execute Phase 8 music infrastructure cleanup.
9. Execute Phase 9 cache naming cleanup.
10. Execute Phase 10 selective API boundary normalization.
11. Execute Phase 11 residual shared type cleanup.
12. Execute Phase 12 command service contract canonicalization.
13. Execute Phase 13 API handler/service pair consolidation.
14. Execute Phase 14 music legacy wrapper cleanup.
15. Execute Phase 15 domain naming boundary cleanup.
16. Execute Phase 16 guardrails and regression prevention.
17. Execute Phase 17 API hotspot density reduction.
18. Execute Phase 18 music runtime contract extraction.
19. Execute Phase 19 core/infrastructure contract extraction.
20. Execute Phase 20 config contract normalization.
21. After each phase, run full build and targeted tests to ensure no regressions.
22. After all phases, run a full audit scan to confirm duplication reduction and type health.


This order minimizes blast radius and keeps each review focused.
