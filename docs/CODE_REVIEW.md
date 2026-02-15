# Deep Code Review — Services & Handlers Layers

**Scope:** `src/services/` (59 files) and `src/handlers/` (27 files)  
**Date:** 2025  
**Status:** Read-only analysis — no changes made

---

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [God Files (>500 lines)](#1-god-files-500-lines)
3. [Shard-Safety Issues](#2-shard-safety-issues)
4. [Boundary / Layer Violations](#3-boundary--layer-violations)
5. [`as any` and Type Erasure](#4-as-any-and-type-erasure)
6. [Duplicate / Redundant Logic](#5-duplicate--redundant-logic)
7. [Bugs & Logic Errors](#6-bugs--logic-errors)
8. [Missing Input Validation](#7-missing-input-validation)
9. [Hardcoded Values](#8-hardcoded-values)
10. [Error Handling Gaps](#9-error-handling-gaps)
11. [Scalability Concerns](#10-scalability-concerns)
12. [Dead Code & Unused Exports](#11-dead-code--unused-exports)
13. [Cyclomatic Complexity Hot-Spots](#12-cyclomatic-complexity-hot-spots)
14. [Positive Patterns](#13-positive-patterns)
15. [Prioritised Recommendations](#14-prioritised-recommendations)

---

## Executive Summary

The codebase shows strong architectural intent — circuit breakers on every external API, Redis-backed shard-safe state for moderation, a clean event bus for music, and good separation via the Facade pattern. However, several systemic issues exist:

| Category | Count | Severity |
|---|---|---|
| God files (>500 LOC) | 13 | Medium |
| Shard-safety violations | 8 | **High** |
| Boundary violations | 5 | Medium |
| `as any` / type erasure | 40+ | Medium |
| Duplicate logic | 4 | Medium |
| Bugs / logic errors | 6 | **High** |
| Missing validation | 5 | Medium |
| Hardcoded magic values | 12+ | Low |
| Error handling gaps | 6 | Medium |
| Scalability concerns | 5 | Medium |

---

## 1. God Files (>500 lines)

Files exceeding 500 lines that should be decomposed:

| File | Lines | Notes |
|---|---|---|
| `services/api/pixivService.ts` | 935 | Largest file. Hardcoded SERIES_MAP (~40 entries). |
| `services/api/rule34Service.ts` | 860 | Local translationCache (2000 entries max). |
| `services/music/core/LavalinkService.ts` | 794 | Low-level Shoukaku management. |
| `services/music/core/MusicFacade.ts` | 765 | Orchestrator — acceptable if sub-services are thin. |
| `services/music/autoplay/AutoPlayService.ts` | 730 | Hardcoded genre/artist graphs. |
| `services/api/myAnimeListService.ts` | 682 | Jikan API client. |
| `handlers/music/buttonHandler.ts` | 692 | Monolithic switch on button custom IDs. |
| `handlers/music/trackEmbeds.ts` | 668 | Embed builders — mostly declarative, acceptable. |
| `services/guild/SetupWizardService.ts` | 612 | Interactive wizard — hard to split further. |
| `services/moderation/AutoModService.ts` | 598 | Multiple violation-check branches. |
| `services/api/redditService.ts` | 595 | OAuth + multiple fetch methods. |
| `services/music/events/PlaybackEventHandler.ts` | 578 | Event handler with duplicated playback logic. |
| `services/api/nhentaiService.ts` | 545 | API mirrors + fallback logic. |
| `services/guild/RedisCache.ts` | 537 | Core infrastructure — justified. |
| `services/guild/ShardBridge.ts` | 516 | Pub/sub infrastructure — justified. |
| `services/fun/deathbattle/BattleService.ts` | 1365 | Largest file in the project. Complex game logic. |

**Recommendation:** Prioritise splitting `pixivService.ts`, `rule34Service.ts`, `buttonHandler.ts`, and `BattleService.ts`.

---

## 2. Shard-Safety Issues

These use local (in-process) state that will be inconsistent across shards:

### 2.1 `PlaybackService.ts` — Local `GuildMutex` (Line ~23)
```ts
class GuildMutex {
    private locks: Map<string, boolean> = new Map();
```
A `Map<string, boolean>` only locks within one shard. Two shards could process the same guild concurrently. **Use a Redis-based distributed lock (e.g., Redlock).**

### 2.2 `VoiceConnectionService.ts` — `boundGuilds` Set (Line ~30)
```ts
private boundGuilds: Set<string> = new Set();
```
Tracks which guilds have events bound. Only visible to the local shard. If music state migrates between shards this will be stale.

### 2.3 `VoiceConnectionService.ts` — `localInactivityTimers` / `localVCMonitorIntervals` Maps
Local `Map<string, NodeJS.Timeout>` timers. If the shard restarts or the guild is on a different shard, timers are lost.

### 2.4 `LavalinkService.ts` — `readyNodes` Set (Line ~72)
```ts
private readyNodes: Set<string> = new Set();
```
Each shard tracks its own view of which Lavalink nodes are ready. Node failures detected by one shard are invisible to others.

### 2.5 `MusicEventBus.ts` — Local EventEmitter
Extends Node.js `EventEmitter`. Events emitted on one shard are not visible to other shards. Music state changes won't propagate.

### 2.6 `rule34Service.ts` — `translationCache` Map (Line ~50)
```ts
private translationCache: Map<string, string> = new Map();
private readonly MAX_TRANSLATION_CACHE = 2000;
```
Each shard has its own translation cache. 2000 entries × N shards = duplicated memory.

### 2.7 `playHandler.ts` — `pendingLongTracks` Map (Line ~36)
```ts
const pendingLongTracks = new Map<string, PendingTrack>();
```
Confirmation state for long tracks is in-memory. If the user is on a different shard when the button is clicked, the pending state won't be found.

### 2.8 `buttonHandler.ts` / `controlHandler.ts` — Vote skip `setTimeout`
Skip-vote timeouts are stored via `musicCache.setSkipVoteTimeout()` with a local `setTimeout`. If the shard restarts, the vote never expires.

### 2.9 `embedService.ts` — `stats` counter (Line ~30, Low severity)
In-memory hit/miss counter. Not critical but metrics will be per-shard.

### 2.10 `BattleService.ts` — `activeBattles` Map (Line ~137)
Uses both local `Map` and Redis lock — **good hybrid approach**, but the actual `Battle` object (with full game state, intervals, etc.) is only in the local `Map`. If the shard handling the guild changes, the battle is orphaned.

**Overall Assessment:** Music system has the most shard-safety gaps. Moderation services are generally shard-safe (using Redis via CacheService).

---

## 3. Boundary / Layer Violations

### 3.1 Service → Handler Import
**`services/music/core/MusicFacade.ts`** (Line ~20):
```ts
import { trackHandler } from '../../../handlers/music/trackHandler.js';
```
Services should not import from the handler layer. The facade calls `trackHandler.createQueueFinishedEmbed()` (line ~532) which is presentation logic leaking into the service layer.

### 3.2 Service → Handler Import (#2)
**`services/music/core/MusicNowPlayingManager.ts`** (Line ~14):
```ts
import trackHandler from '../../../handlers/music/trackHandler.js';
```
Same violation — `MusicNowPlayingManager` builds embeds (presentation) and sends them directly.

### 3.3 Service → Handler Import (#3)
**`services/music/events/PlaybackEventHandler.ts`** (Line ~10):
```ts
import trackHandler from '../../../handlers/music/trackHandler.js';
```
Event handler in the services layer calls `trackHandler.createNowPlayingEmbed()` to build and send Discord messages.

### 3.4 Handler → Command Import
**`handlers/general/AfkHandler.ts`** (Line ~7):
```ts
import { formatDuration } from '../../commands/general/afk.js';
```
Handler imports a utility from a command file. The utility should be extracted to `utils/`.

### 3.5 Service → Database Direct Access (Bypass Repository)
**`services/moderation/InfractionService.ts`** (Lines ~321, ~349):
```ts
const result = await db.query('DELETE FROM infractions WHERE ...', [...]);
```
Bypasses the `InfractionRepository` and uses `db.query` directly. Breaks the repository abstraction.

---

## 4. `as any` and Type Erasure

### 4.1 Systemic: `type Track = any` in Every Music Handler
The following files all define `type Track = any`, completely erasing type safety for the core domain object:

| File | Line |
|---|---|
| `handlers/music/playHandler.ts` | 16 |
| `handlers/music/queueHandler.ts` | 15 |
| `handlers/music/controlHandler.ts` | 16 |
| `handlers/music/buttonHandler.ts` | 17 |
| `handlers/music/favoritesHandler.ts` | 13 |
| `handlers/music/historyHandler.ts` | 13 |
| `handlers/music/settingsHandler.ts` | 21 |

**Root cause:** The `Track` type in `services/music/core/MusicTypes.ts` and `handlers/music/trackTypes.ts` are structurally different (service has `track.encoded`, handler has `lengthSeconds`). They should be unified or mapped via a DTO.

### 4.2 `QueueService.ts` — Complete Type Erasure (Line ~14)
```ts
const musicCacheImport = (await import('../../../cache/music/MusicCacheFacade.js')).default;
type MusicCacheFacade = { ... }; // inline interface
```
Dynamic import cast to local inline type. The real `MusicCacheFacade` type is never used.

### 4.3 `MusicNowPlayingManager.ts` — Multiple `as any` (Lines ~77, ~99, ~105, ~145, ~151)
Casts track objects and component arrays to `any` when passing to `trackHandler` methods. Direct symptom of the Track type mismatch.

### 4.4 `PlaybackEventHandler.ts` — `as any` on Queue (Lines ~86, ~235, ~536)
`musicCache.getQueue(guildId) as any` — avoids dealing with the real queue type.

### 4.5 `AutoPlayService.ts` — `as any` on Track Result (Line ~717)
```ts
const length = (result as any).lengthSeconds || (result.info as any)?.length;
```
Attempts to extract duration from an unknown result shape.

### 4.6 `redditService.ts` — `as any` on Axios Config (Lines ~267, ~374)
Casts entire config objects to `any` to bypass Axios type checking.

### 4.7 `FilterService.ts` — `as any` on Repository Params (Lines ~160, ~173)
```ts
const filter = await FilterRepository.add(data as any);
```
Filter data shape doesn't match the repository's expected type.

### 4.8 `InfractionService.ts` — `as any` on Config (Line ~334)
```ts
const defaultThresholds = (moderationConfig.punishments as any)?.defaultThresholds || [];
```

### 4.9 `animeHandler.ts` — `as any` on Dates/Relations (Lines ~161, ~163, ~188, ~194, ~230, ~232, ~283, ~285)
8 separate `as any` casts for date/relation objects that could use proper interfaces.

### 4.10 `AutoModHandler.ts` — `as any` on Violation (Line ~113)
```ts
await sendViolationNotice(message, violation as any, result);
```

### 4.11 `MusicUserDataService.ts` — Return Types All `any`
Every method returns `Promise<any>` or `Promise<any[]>`, providing zero type information to callers.

---

## 5. Duplicate / Redundant Logic

### 5.1 Triple `playTrack` Implementation
Track playback logic exists in three places:
1. **`MusicFacade.ts`** `playTrack()` (line ~220)
2. **`PlaybackService.ts`** `playTrack()` (line ~50)
3. **`PlaybackEventHandler.ts`** `_playTrack()` (line ~350)

Each has slightly different error handling and side effects. This creates drift risk.

### 5.2 Duplicate `search` Methods
- `LavalinkService.ts` has both `search()` and `searchMultiple()` (line ~450)
- `PlaybackService.ts` has `search()` and `searchPlaylist()` that wrap `LavalinkService.search()`
- `MusicFacade.ts` exposes `search()` that delegates to `PlaybackService.search()`

Three layers of delegation with no added logic.

### 5.3 Duplicate `handleLocalRequest` / `handleRequest`
**`ShardBridge.ts`** has both `handleRequest()` (line ~170) and `handleLocalRequest()` (line ~370) with the same switch cases for `getStats`, `getGuildCount`, `getUserCount`, etc. Any new request type must be added in both places.

### 5.4 `favoritesHandler.handleFavoritesClear` — Serial Deletion
```ts
for (const fav of favorites) {
    await musicService.removeFavorite(userId, fav.url);
}
```
Deletes favorites one-by-one in a loop instead of using a bulk `clearFavorites()` operation.

---

## 6. Bugs & Logic Errors

### 6.1 `QueueService.toggleShuffle` — Returns Value Before Toggle (Line ~296)
```ts
toggleShuffle(guildId: string): boolean {
    // ... shuffle logic ...
    return queue.isShuffled;  // Returns the value BEFORE toggle completes
}
```
The `isShuffled` flag is read before the queue state is fully toggled, potentially returning an incorrect value.

### 6.2 `QueueService.addSkipVote` — `odId` Typo (Line ~45)
The internal interface has parameter named `odId` instead of `userId`. While it works at runtime (JavaScript doesn't enforce parameter names), it indicates a copy-paste error.

### 6.3 `AntiRaidService._detectSimilarUsernames` — Spread on Empty Map
```ts
Math.max(...prefixMap.values(), 0)
```
If `prefixMap` is empty, `...prefixMap.values()` spreads zero arguments, and `Math.max(0)` = 0. This works but is fragile — in strict mode or other engines, spreading an empty iterable into `Math.max()` returns `-Infinity` before the `0` fallback.

### 6.4 `LavalinkService` — Non-null Assertion on Circuit Breaker (Line ~384)
```ts
this.circuitBreaker!.execute(...)
```
If `initialize()` hasn't been called or failed, `circuitBreaker` is `null` and this will throw `Cannot read property 'execute' of null`.

### 6.5 `handleMessageUpdate` Passes `null` as Client
**`AutoModHandler.ts`** (Line ~167):
```ts
return handleMessage(null, newMessage);
```
The `handleMessage` function signature accepts `client: unknown` but this is a code smell — the `null` propagates to any code that might later use the client parameter.

### 6.6 `MusicNowPlayingManager.disableNowPlayingControls` — Manual Component Construction (Line ~71)
```ts
const disabledRows = message.components.map((row: any) => ({
    type: row.type,
    components: row.components.map((c: any) => ({
        ...c.data,
        disabled: true
    }))
}));
```
Manually reconstructing component data from `row.components[].data` is brittle. If Discord.js changes its internal `data` shape, this silently breaks. Should use the discord.js `ActionRowBuilder` API.

---

## 7. Missing Input Validation

### 7.1 `FilterService.ts` — Regex from User Input
User-supplied filter patterns are compiled as `RegExp` objects without sanitisation. A malicious pattern like `(a+)+$` causes ReDoS (catastrophic backtracking).

### 7.2 `FilterService.normalizeText` — Performance
Creates new `RegExp` objects in a loop for every character replacement during leetspeak/unicode normalisation. Should precompile these patterns.

### 7.3 `controlHandler.handleSeek` — Partial Validation
Time parsing does check for `NaN` and negative values but does not validate parts (e.g., `minutes > 59` or `seconds > 59` are accepted silently like `"99:99"`).

### 7.4 `playHandler.ts` — No URL Sanitisation
User-provided URLs/queries are passed directly to `musicService.search()` without sanitisation or length limits.

### 7.5 `SnipeService.ts` — Content Only Truncated
Snipe content is truncated to 2000 chars but not sanitised for injection vectors (e.g., Discord markdown exploits, @everyone mentions).

---

## 8. Hardcoded Values

| File | Line(s) | Value | Should Be |
|---|---|---|---|
| `AutoPlayService.ts` | ~46-120 | `GENRE_PATTERNS` (38 entries), `ARTIST_GRAPH` (30 entries) | Config file or database |
| `AntiRaidService.ts` | ~30-35 | `JOIN_TRACKER_TTL=300`, `RAID_MODE_TTL=1800` | Guild-configurable |
| `SnipeService.ts` | ~20-25 | `MAX_MESSAGES=25`, `EXPIRY=43200` | Config file |
| `LockdownService.ts` | ~50 | `LOCKDOWN_TTL=86400` | Config or guild setting |
| `MusicEventBus.ts` | ~15 | `setMaxListeners(50)`, stats reset = 1 hour | Config constant |
| `VoiceConnectionService.ts` | — | Inactivity check interval = 10s, inactivity timeout = 5min | Config |
| `buttonHandler.ts` | — | `SKIP_VOTE_TIMEOUT`, `MIN_VOTES_REQUIRED` | Config |
| `steamService.ts` | — | User-Agent = "FumoBOT/2.0" | Config |
| `wikipediaService.ts` | — | User-Agent = "FumoBOT/2.0" | Central config |
| `pixivService.ts` | ~20-50 | `SERIES_MAP` (~40 hardcoded series) | Database or config JSON |
| `nhentaiService.ts` | ~30 | `POPULAR_GALLERIES` array, API mirrors | Config |
| `ModerationService.ts` | ~56-87 | `CONFIG.COLORS`, `DURATION_PRESETS` | Config file |

---

## 9. Error Handling Gaps

### 9.1 `MusicNowPlayingManager.sendNowPlayingEmbed` — Silent Catch-All
```ts
} catch (error) {
    // Silent fail
}
```
All errors during now-playing embed creation are swallowed with no logging.

### 9.2 `playHandler.refreshNowPlayingMessage` — Silent Catch-All
```ts
} catch {
    // Silently ignore errors
}
```
Same pattern — errors editing the now-playing message are completely hidden.

### 9.3 `VoiceConnectionService` — `require()` in Error Path
Uses `require()` for lazy-loading events module (line ~62). This is a CommonJS pattern that may fail in an ESM context.

### 9.4 `CobaltService._requestDownload` — Callback-based Error Handling
Uses raw `http.request` with manual callback error handling instead of `fetch()` or a promise wrapper. Errors in the `req.on('error')` handler could be lost if the promise is already resolved.

### 9.5 `buttonHandler.handleButtonQueuePage` — No-op Handler
```ts
async handleButtonQueuePage(interaction, guildId, pageAction) {
    await interaction.deferUpdate();
    // Does nothing else
}
```
Queue page navigation buttons do nothing after deferring.

### 9.6 `AutoModHandler.sendViolationNotice` — Empty Catch
```ts
} catch {
    // Channel might not allow sending
}
```
Legitimate errors (e.g., rate limiting, Discord API errors) are hidden.

---

## 10. Scalability Concerns

### 10.1 `VoiceConnectionService` — Polling Every 10 Seconds
`inactivityCheckerInterval` polls Redis every 10 seconds per guild. At 1000 guilds, that's 100 Redis commands/second just for inactivity checking. Should use Redis key expiry notifications or a single sorted-set scan.

### 10.2 `LockdownService.lockServer` — Sequential Channel Updates
Iterates all text channels in a guild sequentially with a 100ms delay between each. A server with 100 channels takes 10 seconds to lock down.

### 10.3 `AutoModService.ts` — Sequential Violation Checks
Each message runs through spam → duplicate → links → invites → mentions → caps → banned words sequentially. Could short-circuit on first violation or run checks in parallel.

### 10.4 `BattleService.ts` — Local Map for Active Battles (1365 lines)
Active battles are stored in a local `Map`. While Redis locks prevent cross-shard duplicates, the game state (including `setInterval` for rounds) is entirely local. This prevents horizontal scaling of the game feature.

### 10.5 `VideoDownloadService` — No Concurrency Limit
Multiple users can trigger simultaneous video downloads without queuing. Combined with temp file creation, this could exhaust disk space or memory on the container.

---

## 11. Dead Code & Unused Exports

### 11.1 `PlaybackEventHandler._handleTrackEnd` — Defined But Not Subscribed
Line ~166 has a comment: "Do NOT subscribe to TRACK_END here." The method exists but is never called. Dead code.

### 11.2 `InfractionService.getUserHistory` — Unused `options` Parameter
Accepts `options?: { limit?: number; type?: string }` but never uses `limit` or `type` for filtering.

### 11.3 `playHandler.handlePriorityVote` — Stub Method
Returns a "coming soon" message. Either implement or remove.

### 11.4 `buttonHandler.handleButtonQueuePage` — Empty Handler
Only calls `deferUpdate()`, then does nothing. Pagination buttons are non-functional.

### 11.5 `SayService.sendMessage` — Unused `_content` Parameter
```ts
async sendMessage(channel, _content, useEmbed, message, type, creditText)
```
The `_content` parameter is accepted but never used (underscore prefix indicates intentional ignore, but should still be cleaned up).

---

## 12. Cyclomatic Complexity Hot-Spots

| File | Method | Est. CC | Concern |
|---|---|---|---|
| `AutoModService.ts` | `executeAction()` | ~15+ | Nested switch + if chains per violation type |
| `buttonHandler.ts` | `handleButton()` | ~20+ | Monolithic switch on 15+ button custom IDs |
| `AutoPlayService.ts` | `_selectStrategy()` | ~12 | Multiple weighted random branches |
| `PlaybackEventHandler.ts` | `_handleTrackStart()` | ~10 | Multiple conditional paths for track start |
| `BattleService.ts` | `processRound()` | ~30+ | Complex game combat logic with many effect checks |
| `CobaltService.ts` | `_requestDownload()` | ~12 | Multiple response format handling |
| `controlHandler.ts` | `handleSeek()` | ~10 | Time parsing with 3+ format branches |

---

## 13. Positive Patterns

These patterns are well-implemented and should be maintained:

1. **Circuit Breakers on all external APIs** — `anilistService`, `steamService`, `pixivService`, `redditService`, `rule34Service`, `nhentaiService`, `wikipediaService`, `myAnimeListService` all use `circuitBreakerRegistry`.

2. **Redis-backed shard-safe state for moderation** — `AutoModService`, `AntiRaidService`, `SnipeService`, `LockdownService` all use `CacheService` (Redis) for state. This is correct for multi-shard deployments.

3. **Event Bus for music decoupling** — `MusicEventBus` separates playback events from handlers, allowing for extensible event processing.

4. **Result pattern** in some services for typed error handling.

5. **Facade pattern** (`MusicFacade`) properly orchestrates sub-services without exposing internals.

6. **Proper split of `trackHandler.ts`** — Originally 1074 lines, correctly decomposed into `trackTypes.ts`, `trackEmbeds.ts`, `trackButtons.ts` + facade.

7. **ShardBridge** — Clean Redis pub/sub architecture for cross-shard communication with proper timeout handling.

8. **RedisCache** — Well-designed fallback to in-memory cache with sweep-based expiry (no per-key timers). LRU eviction at 10K entries.

9. **AntiRaidService** — Fully shard-safe with Redis, proper TTL-based cleanup, account age checking.

10. **GuildSettingsService** — Clean Redis → PostgreSQL fallback with cache invalidation.

11. **Eval disabled on ShardBridge** — RCE vector properly removed with clear comment referencing the security review.

---

## 14. Prioritised Recommendations

### P0 — Critical (Fix First)

1. **Unify the `Track` type.** Create a single `Track` DTO shared between services and handlers. Remove all `type Track = any` declarations. This affects 7+ handler files and 5+ service files.

2. **Replace local `GuildMutex`** in `PlaybackService.ts` with a Redis-based distributed lock (e.g., Redlock pattern already available via `ioredis`).

3. **Fix `QueueService.toggleShuffle`** to return the new state instead of the pre-toggle state.

### P1 — High (Address Soon)

4. **Remove service → handler imports.** Move embed creation out of `MusicFacade`, `MusicNowPlayingManager`, and `PlaybackEventHandler`. Either:
   - Emit events and let the handler layer subscribe, or
   - Pass an embed-builder callback into the service.

5. **Validate user-supplied regex patterns** in `FilterService.ts` to prevent ReDoS. Wrap in try/catch and set a timeout.

6. **Move `pendingLongTracks`** in `playHandler.ts` to Redis with a TTL.

7. **Consolidate `playTrack` logic** into a single authoritative implementation in `PlaybackService`, with `MusicFacade` and `PlaybackEventHandler` calling it.

### P2 — Medium (Planned Work)

8. **External configuration for hardcoded values** — Extract `GENRE_PATTERNS`, `ARTIST_GRAPH`, `SERIES_MAP`, and similar data to config files.

9. **Split `BattleService.ts`** (1365 lines) — Extract effect processing, damage calculation, and round management into separate modules.

10. **Split `buttonHandler.ts`** (692 lines) — Use a strategy/registry pattern to map button custom IDs to handler functions.

11. **Implement queue pagination** — `handleButtonQueuePage` is a no-op.

12. **Add concurrency limiting to `VideoDownloadService`** — Use a semaphore or job queue to prevent resource exhaustion.

13. **Consolidate `handleRequest` / `handleLocalRequest`** in `ShardBridge.ts` to eliminate duplication.

### P3 — Low (Tech Debt)

14. **Replace `dotenv.config()` calls** in individual services (`steamService`, `pixivService`, `rule34Service`, `nhentaiService`) with a single top-level config load.

15. **Move `formatDuration`** imported by `AfkHandler` from command file to `utils/`.

16. **Add logging** to silent catch blocks in `MusicNowPlayingManager` and `playHandler.refreshNowPlayingMessage`.

17. **Fix the `_content` unused parameter** in `SayService.sendMessage`.

18. **Remove or implement `handlePriorityVote`** stub in `playHandler`.

19. **Replace `require()`** in `VoiceConnectionService` with dynamic `import()`.

20. **Standardise HTTP client** — `redditService` uses `axios` while all other API services use `fetch`. Pick one.
