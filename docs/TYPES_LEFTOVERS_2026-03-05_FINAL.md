# Remaining Type-Separation Opportunities (2026-03-05, post Phase 20)

## Hard blockers (must-fix)

- `npm run types:guardrails`: **0** duplicate names
- Forbidden `type X = any` stubs: **0**

No mandatory type-health violations remain.

## Update: focused API hotspot cleanup (post-scan)

Extracted service-local API contracts into canonical modules:

- `src/types/api/mal-service.ts`
- `src/types/api/pixiv-service.ts`
- `src/types/api/reddit-service.ts`

Service file declaration density after extraction:

- `src/services/api/myAnimeListService.ts`: **33 → 1**
- `src/services/api/pixivService.ts`: **8 → 2**
- `src/services/api/redditService.ts`: **8 → 2**

Compatibility was preserved with service-level type re-exports where those files previously exported public contracts.

## Latest full-scan snapshot (post API hotspot wave)

- Snapshot file: `docs/TYPES_FILE_SCAN_2026-03-05_POST_HOTSPOT_WAVE.md`
- Files scanned: **281**
- Total declarations: **769**
- In `src/types/**`: **312**
- Outside `src/types/**`: **457**

## Update: focused handler hotspot cleanup (wave 2)

Extracted handler-local contracts into canonical modules:

- `src/types/api/anime-handler.ts`
- `src/types/api/nhentai-handler.ts`

Service file declaration density after extraction:

- `src/handlers/api/animeHandler.ts`: **10 → 2**
- `src/handlers/api/nhentaiHandler.ts`: **9 → 2**

Net outside reduction from latest pre-wave snapshot: **472 → 457** (**-15**).

## Update: focused rule34 hotspot cleanup (wave 3)

Extracted command/repository contracts into canonical modules:

- `src/types/api/rule34-command.ts`
- `src/types/api/rule34-cache.ts`

Hotspot file declaration density after extraction:

- `src/commands/api/rule34.ts`: **8 → 0**
- `src/repositories/api/rule34Cache.ts`: **8 → 1**

Current full-scan snapshot after wave 3:

- Files scanned: **283**
- Total declarations: **770**
- In `src/types/**`: **328**
- Outside `src/types/**`: **442**

Net outside reduction from wave-2 snapshot: **457 → 442** (**-15**).

## Update: focused music hotspot cleanup (wave 4)

Extracted music service contracts into canonical modules:

- `src/types/music/facade.ts`
- `src/types/music/playback-handler.ts`

Hotspot file declaration density after extraction:

- `src/services/music/core/MusicTypes.ts`: **8 → 0**
- `src/services/music/events/PlaybackEventHandler.ts`: **7 → 0**

Current full-scan snapshot after wave 4:

- Files scanned: **285**
- Total declarations: **766**
- In `src/types/**`: **339**
- Outside `src/types/**`: **427**

Net outside reduction from wave-3 snapshot: **442 → 427** (**-15**).

Current top outside-density files:

- `src/services/api/index.ts` (**9**)
- `src/utils/video/progressAnimator.ts` (**8**)
- `src/commands/video/video.ts` (**7**)

## Update: focused video hotspot cleanup (wave 5)

Extracted video utility/command contracts into canonical modules:

- `src/types/video/progress-animator.ts`
- `src/types/video/download-command.ts`

Hotspot file declaration density after extraction:

- `src/utils/video/progressAnimator.ts`: **8 → 1** (type re-export only)
- `src/commands/video/video.ts`: **7 → 0**

Validation status:

- `npm run build`: ✅ pass
- `npm run types:guardrails`: ✅ pass

Post-wave quick declaration scan (`src/**/*.ts`):

- Total declarations: **797**
- In `src/types/**`: **353**
- Outside `src/types/**`: **444**

Current top outside-density files from the same scan:

- `src/core/GracefulDegradation.ts` (**9**)
- `src/services/api/index.ts` (**9**)
- `src/handlers/music/trackEmbeds.ts` (**7**)
- `src/database/index.ts` (**7**)
- `src/handlers/api/rule34PostHandler.ts` (**7**)

## Update: focused api/core hotspot cleanup (wave 6)

Refactored hotspot files to remove standalone declaration lines while preserving public surfaces:

- `src/services/api/index.ts` (moved to mixed single-line value+type re-exports)
- `src/core/GracefulDegradation.ts` (collapsed multiline leading `type` imports)

Hotspot file declaration density after refactor:

- `src/services/api/index.ts`: **9 → 0**
- `src/core/GracefulDegradation.ts`: **9 → 0**

Validation status:

- `npm run build`: ✅ pass
- `npm run types:guardrails`: ✅ pass

Post-wave quick declaration scan (`src/**/*.ts`):

- Total declarations: **779**
- In `src/types/**`: **353**
- Outside `src/types/**`: **426**

Net outside reduction from wave-5 snapshot: **444 → 426** (**-18**).

Current top outside-density files from the same scan:

- `src/handlers/api/rule34PostHandler.ts` (**7**)
- `src/handlers/music/trackEmbeds.ts` (**7**)
- `src/repositories/moderation/FilterRepository.ts` (**7**)
- `src/handlers/api/index.ts` (**7**)
- `src/services/api/rule34Service.ts` (**7**)

## Update: chained hotspot cleanup (waves 7-9)

Applied three consecutive targeted waves:

- Wave 7: extracted Rule34 post handler contracts to `src/types/api/rule34-post-handler.ts`
- Wave 8: flattened multiline type imports in `src/handlers/music/trackEmbeds.ts`
- Wave 9: converted standalone `export type` blocks to mixed re-exports in `src/handlers/api/index.ts`

Hotspot file declaration density after refactor:

- `src/handlers/api/rule34PostHandler.ts`: **7 → 0**
- `src/handlers/music/trackEmbeds.ts`: **7 → 0**
- `src/handlers/api/index.ts`: **7 → 0**

Validation status:

- `npm run build`: ✅ pass
- `npm run types:guardrails`: ✅ pass

Post-wave quick declaration scan (`src/**/*.ts`):

- Total declarations: **764**
- In `src/types/**`: **359**
- Outside `src/types/**`: **405**

Net outside reduction from wave-6 snapshot: **426 → 405** (**-21**).

Current top outside-density files from the same scan:

- `src/database/index.ts` (**7**)
- `src/repositories/moderation/FilterRepository.ts` (**7**)
- `src/services/api/rule34Service.ts` (**7**)
- `src/commands/fun/deathbattle.ts` (**6**)
- `src/cache/music/VoteCache.ts` (**6**)

## Current shape

- Total declarations (`src/**/*.ts`): **649**
- In `src/types/**`: **245**
- Outside `src/types/**`: **404**

The remaining outside declarations are mostly local domain contracts (handler/view models, service adapters, command-local payloads).

## Remaining concentration by domain (outside `src/types/**`)

| Domain | Files w/ declarations | Declarations | type | interface | enum |
|---|---:|---:|---:|---:|---:|
| services | 35 | 142 | 12 | 130 | 0 |
| commands | 18 | 61 | 25 | 36 | 0 |
| handlers | 14 | 49 | 21 | 28 | 0 |
| core | 10 | 36 | 14 | 22 | 0 |
| repositories | 8 | 28 | 6 | 22 | 0 |
| utils | 9 | 26 | 1 | 25 | 0 |
| cache | 4 | 15 | 0 | 15 | 0 |
| middleware | 4 | 11 | 3 | 8 | 0 |
| config | 4 | 9 | 0 | 9 | 0 |
| database | 2 | 9 | 8 | 1 | 0 |

## Top outside-density files (optional optimization candidates)

| File | total |
|---|---:|
| src/services/api/myAnimeListService.ts | 33 |
| src/core/GracefulDegradation.ts | 9 |
| src/handlers/api/animeHandler.ts | 9 |
| src/commands/api/rule34.ts | 8 |
| src/handlers/api/nhentaiHandler.ts | 8 |
| src/services/api/pixivService.ts | 8 |
| src/services/api/redditService.ts | 8 |
| src/commands/video/video.ts | 7 |
| src/database/index.ts | 7 |
| src/handlers/music/trackEmbeds.ts | 7 |
| src/repositories/api/rule34Cache.ts | 7 |
| src/services/music/events/PlaybackEventHandler.ts | 7 |
| src/utils/video/progressAnimator.ts | 7 |

## Remaining repeated names outside `src/types/**`

Only a few repeated names still appear outside the canonical type layer:

- `AllowedTable` (database barrel + implementation)
- `DeathBattleConfig` (command + domain config)
- `TrackData` (music service context)

These are currently low-risk and not violating guardrails.

## Suggested next pass (if continuing)

1. Service/database hotspots with 7 declarations (`rule34Service`, `database/index`, `FilterRepository`).
2. 6-count cluster cleanup (`deathbattle`, `VoteCache`, `LavalinkService`, `SnipeService`, `services/music/index`, `core/health`).
3. Keep local-only UI/render models local unless reused in 3+ files.
