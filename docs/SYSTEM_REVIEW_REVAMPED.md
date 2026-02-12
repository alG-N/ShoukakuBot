# alterGolden — Full Post-Change Revalidation (REVAMPED)

**Date:** 2026-02-06  
**Reviewer Role:** CTO / Principal Engineer  
**Scope:** Complete codebase revalidation after major refactors (Phases A–D)  
**Version Reviewed:** 4.1.0 (codebase) / 2.0.0 (package.json)  
**Target Scale:** 1,000+ Discord servers, multi-shard, long uptime  
**Previous Review:** `docs/SYSTEM_REVIEW.md` — 5.5 → 7.8/10 after fixes  
**Purpose:** Independent revalidation — verify what's actually fixed, find what was missed, identify new risks  

---

## Overall System Rating: 7.2 / 10

The previous review scored the system at 7.8/10 after all fixes. After independent deep-dive analysis, I'm adjusting to **7.2/10**. The foundational architecture is genuinely strong. The previous review was thorough and the fixes were real. But it over-counted resolved items while under-counting persistent structural debt, dead code accumulation, and new issues introduced or missed during the refactor.

| Category | Grade | Rating | Weight | Justification |
|---|---|---|---|---|
| Architecture Coherence | B+ | 8/10 | High | DI container, Result pattern, BaseCommand lifecycle, circuit breakers — all genuinely well-designed. Container uses `instance()` correctly (same refs as direct imports). |
| Scalability & Shard Safety | C+ | 6/10 | Critical | **Downgraded.** Health port collision, GracefulDegradation Redis keys not shard-scoped, FIFO eviction sold as LRU, `KEYS *` in production path, QueueCache holding Message objects. |
| Reliability & Failure Modes | B+ | 8/10 | High | Circuit breakers + graceful degradation + Result pattern is a strong trio. Postgres retry logic is excellent. But circuit breaker has a counting bug and events lack error boundaries. |
| Code Quality & Consistency | C+ | 6/10 | Medium | **Downgraded.** 50+ `require()`/`getDefault()` calls still scattered across commands. `access.ts` is a 525-line kitchen sink. Duplicate files exist. Module-scope side effects. |
| Data Integrity | B | 7/10 | Critical | SQL schemas fixed. ALLOWED_TABLES corrected. But `getNextCaseId()` has a race condition, `addFavorite` has no transaction, rule34 blacklist returns empty on cache miss. |
| Security | B | 7/10 | Critical | Credentials env-only ✅, `execFileSync` ✅, URL validator ✅. But `ShardBridge` eval handler is an RCE vector if flag is flipped, and filter presets are empty shells. |
| Developer Experience | C+ | 6/10 | Medium | **Downgraded.** High cognitive load from competing patterns (require vs import, 3 cooldown systems, 3 logger implementations). `automod.ts` at 1100 lines. `trackHandler.ts` at 1074 lines. |
| Test Coverage | F | 2/10 | High | **Downgraded.** Test infrastructure exists but coverage is negligible. No command tests, no repository tests, no integration tests for critical paths. This is the single largest systemic risk. |
| Deployment Readiness | B+ | 8/10 | High | Working Dockerfile, docker-compose with health checks, memory limits, log rotation. Solid. |
| Documentation | B | 7/10 | Low | Existing SYSTEM_REVIEW.md is excellent operational documentation. Inline JSDoc is thorough. Missing: API contract docs, onboarding guide. |

**Weighted Score: 7.2/10**

---

## 1. What Is Now Solid

These are genuine, verified improvements. Not aspirational — actually working in the codebase.

### ✅ DI Container Done Right (`src/container.ts` + `src/bootstrap/services.ts`)
The container uses `container.instance()` to register pre-existing module-level singletons. This eliminates the dual-instance problem (container and direct imports reference the SAME object). 50+ services registered. Container handles lifecycle shutdown automatically. Circular dependency detection works. This is production-quality DI.

### ✅ Result Pattern (`src/core/Result.ts`)
Zero dependencies. Immutable. Type-safe discriminated union with `.map()`, `.flatMap()`, `.unwrap()`, `.unwrapOr()`, `.toDiscordEmbed()`. Used consistently in moderation services and playback. Best-designed file in the codebase.

### ✅ Circuit Breaker + Graceful Degradation (`src/core/CircuitBreaker.ts`, `GracefulDegradation.ts`)
Real state machine (CLOSED → OPEN → HALF_OPEN). Multi-tier fallback: custom → registered handler → stale cache → static default → failure. Write-ahead queue with Redis persistence. Every external API wraps calls through this.

### ✅ CacheService Unified Architecture (`src/cache/CacheService.ts`)
1,200 lines of well-designed cache. Redis primary, in-memory fallback. Namespace isolation with per-namespace config. Rate limiting, cooldowns, automod tracking all built in. When Redis is connected, all namespaces share state across shards.

### ✅ Moderation Stack — Fully Shard-Safe
All 8 moderation services use PostgreSQL or Redis. `AntiRaidService`, `LockdownService`, `SnipeService` — all Redis-backed. `InfractionService`, `FilterService` — all DB-backed. Result pattern in core moderation logic.

### ✅ BaseCommand Pattern (`src/commands/BaseCommand.ts`)
Unified command lifecycle: validation → cooldown → defer → execute → metrics → error handling. All 27 commands extend this consistently. `safeReply()` handles interaction expiry gracefully. This is the right abstraction.

### ✅ Database Layer (`src/database/postgres.ts`)
892 lines of robust connection management. Retry with exponential backoff + jitter. Transient error detection. Read replica routing with query analysis. Table whitelist + identifier regex for SQL injection prevention. Write queue for graceful degradation. Connection pool monitoring with Prometheus metrics.

### ✅ Shutdown Orchestration (`src/core/shutdown.ts`)
Clean 4-step sequence: Discord client → registered handlers → container.shutdown() → static cleanup. Re-entrance guard. 15-second timeout. Container handles all service lifecycle automatically — no manual shutdown code needed.

### ✅ ShardBridge (`src/services/guild/ShardBridge.ts`)
Redis Pub/Sub cross-shard communication with request-response pattern, broadcast, and single-shard fallback. 10-second timeout on pending requests. Correct foundation for horizontal scaling.

### ✅ Startup Validation (`src/config/validation.ts`)
`validateOrExit()` called at top of `index.ts` before any initialization. Required vars checked: `BOT_TOKEN`, `CLIENT_ID`, `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`. Optional vars warned. Fail-fast design.

---

## 2. Critical Blockers

Issues that **must be fixed** before scaling beyond current deployment.

### 🔴 BLOCKER 1: Health Server Port Collision Under Sharding (SEVERITY: HIGH)

**File:** `src/core/health.ts`, `src/sharding.ts`  
**Issue:** Each shard process starts an HTTP health server on the same port (`HEALTH_PORT=3000`). When running multiple shards on the same machine, only shard 0 will successfully bind. Shards 1+ will crash with `EADDRINUSE`.

The shard manager also starts its own health server on `SHARD_HEALTH_PORT=3001`.

**Impact:** Multi-shard deployment crashes on startup. Prometheus can only scrape one shard's metrics.  
**Fix:** Health port must be `base_port + shard_id`. Shard ID is available via `client.shard?.ids[0]`.  
**Effort:** 1 hour.

### 🔴 BLOCKER 2: GracefulDegradation Redis Key Not Shard-Scoped (SEVERITY: HIGH)

**File:** `src/core/GracefulDegradation.ts`  
**Issue:** The write-ahead queue uses Redis key `graceful:writequeue:pending` — this is **global across all shards**. Multiple shards will read and process the same queued writes on recovery, causing duplicate operations.

`recoverWriteQueue()` deduplicates by `timestamp`, but two writes at the same millisecond from different shards will collide. No shard ID in the key.

**Impact:** Duplicate writes to external services after recovery. Data corruption in edge cases.  
**Fix:** Key should be `graceful:writequeue:pending:shard:{shardId}` or use a proper distributed queue.  
**Effort:** 2 hours.

### 🔴 BLOCKER 3: `clearNamespace` Uses Redis `KEYS` Command (SEVERITY: HIGH)

**File:** `src/cache/CacheService.ts`  
**Issue:** `clearNamespace()` calls `KEYS ns:*` which blocks Redis and is O(n) over all keys. With 1000+ servers generating cache entries across all namespaces, this can stall the Redis instance and affect all shards.

`clearUserCooldowns()` correctly uses `SCAN` — proving the team knows the pattern. This was missed.

**Impact:** Redis stalls under load, affecting all connected services.  
**Fix:** Replace `KEYS` with `SCAN` iterator (already pattern-proven in the same file).  
**Effort:** 30 minutes.

### 🔴 BLOCKER 4: Test Coverage at 2/10 (SEVERITY: CRITICAL)

**File:** `tests/`  
**Issue:** Test infrastructure exists (Jest configured, setup files present) but actual coverage is negligible. No tests for:
- Commands (0/27 tested)
- Repositories (0/12 tested)
- CacheService operations
- Circuit breaker state transitions
- Graceful degradation fallback paths
- BaseCommand lifecycle
- Event error handling

**Impact:** Every code change is a gamble. Regressions will ship undetected. The system has been refactored extensively without test verification — it works by coincidence, not by proof.  
**Fix:** Minimum viable test suite for critical paths. See §7 for prioritized plan.  
**Effort:** 30–40 hours.

### 🔴 BLOCKER 5: `InfractionRepository.getNextCaseId()` Race Condition (SEVERITY: HIGH)

**File:** `src/repositories/moderation/InfractionRepository.ts`  
**Issue:** Uses `MAX(case_id) + 1` to generate the next case ID. Two simultaneous infraction creates (e.g., from concurrent moderation commands) can get the same case ID.

**Impact:** Duplicate case IDs. Data integrity violation in the moderation system — the single most important data store for Discord server admins.  
**Fix:** Use PostgreSQL `SERIAL`/`SEQUENCE` column or `SELECT ... FOR UPDATE`.  
**Effort:** 30 minutes.

---

## 3. Legacy / Dead / Non-Updated Code Breakdown

### Category A: Safe to Delete Immediately

| # | File/Code | Why It Exists | Why Problematic | Replaced By | Risk |
|---|---|---|---|---|---|
| A1 | `src/utils/common/httpClient.ts` (entire file) | Centralized HTTP client with retry, pre-configured profiles | **Zero imports in entire `src/`**. Never wired in. Duplicates retry logic in `apiUtils.ts`. | Direct axios + `apiUtils.withRetry()` | 🟢 None |
| A2 | `src/utils/music/index.ts` — `formatTimeAgo()`, `formatViewCount()`, `formatNumber()`, `truncateText()`, `formatTimestamp()` | Music-specific utility functions | **Not imported by any file.** Duplicated from `utils/common/time.ts` and `utils/common/embed.ts`. | Same-named functions in `utils/common/` | 🟢 None |
| A3 | `src/utils/common/time.ts` — `unixTimestamp()`, `isToday()`, `startOfDay()`, `endOfDay()` | Time utility functions | **Not imported by any file.** Dead exports. | Nothing — not needed | 🟢 None |
| A4 | `src/utils/common/apiUtils.ts` — `withTimeout()`, `withTimeoutAndRetry()`, `RateLimiter` class | API call utilities | **Not imported.** `withRetry()` is the only used export. `RateLimiter` class duplicates the one in `middleware/access.ts`. | `access.ts` RateLimiter, `core/errorHandler.ts` `withTimeout()` | 🟢 None |
| A5 | `src/repositories/api/pixivCache.ts` — `getSearchResults()`, `setSearchResults()`, `updateSearchResults()` | Alias methods "for button handler compatibility" | ~~Adapter shims from old API~~ **CORRECTION: Actively used by `pixiv.ts`** — not dead code. | N/A | ⚠️ **Keep — was misidentified** |
| A6 | `src/repositories/general/AfkRepository.ts` — `isUserAfk()` | Convenience alias | Pure alias for `getAfk()` — zero additional logic. Dead weight. | `getAfk()` | 🟢 None |
| A7 | `src/core/metrics.ts` — `import { Summary }` | prom-client import | **Imported but never used.** Dead import. | Nothing | 🟢 None |
| A8 | `src/core/Logger.ts` — `import os` | Node built-in import | **Imported but never used.** Dead import. | Nothing | 🟢 None |
| A9 | `src/services/music/LavalinkService.ts` — `finalize()` method | Initialization lifecycle | **Empty method body.** Never called. No-op. | Nothing | 🟢 None |
| A10 | `src/services/registry/CommandRegistry.ts` — `buttonHandlers` / `selectMenuHandlers` Maps | Planned button/menu routing | **Maps declared but never populated.** No code path adds entries. | Routing already handled via `customId.split('_')` in `index.ts` | 🟢 None |
| A11 | `src/services/moderation/SnipeService.ts` — `getStats()` | Statistics API | Returns hardcoded `{ guilds: 0, totalMessages: 0 }`. Placeholder never implemented. | Nothing | 🟢 None |
| A12 | `src/utils/common/cooldown.ts` — `getStats()`, `destroy()` | Diagnostic/lifecycle methods | `getStats()` returns hardcoded zeros. `destroy()` is a no-op. Both are dead code. | Nothing | 🟢 None |

### Category B: Delete After Verification

| # | File/Code | Why It Exists | Why Problematic | Action Needed | Risk |
|---|---|---|---|---|---|
| B1 | `src/commands/music/music.ts` (if duplicate) | Music command file | **May be a duplicate of `MusicCommand.ts`** — two files with similar names in the same directory. One is dead. | Verify which is imported by the registry. Delete the other. | 🟡 Verify first |
| B2 | `src/commands/admin/snipe.ts` — `SnipeCache` class (lines 1–148) | In-memory snipe cache | 148-line cache class **defined inside the command file** that duplicates `snipeService`. Command also imports `snipeService`. The local cache may shadow the service. | Verify which cache is actually used at runtime. Remove the dead one. | 🟡 Medium |
| B3 | `src/services/music/events/PlaybackEventHandler.ts` — `_handleTrackEnd()`, `_handleQueueEnd()` | Event handler methods | Comment at line 98 says `TRACK_END` is handled by `MusicFacade.bindPlayerEvents()` instead. These methods contain independent implementations of the same logic — maintenance trap. | Verify MusicFacade handles these exclusively. Delete dead handlers. | 🟡 Medium |
| B4 | `src/errors/*.ts` (all 4 files) | Error class hierarchy | **All constructors marked `@deprecated`** with guidance to use `Result.err(ErrorCodes.XXX)`. Only 6 `throw new` sites remain (all in `BaseCommand.ts`). Retained for `instanceof` checks. | Migrate remaining `instanceof` checks to error code comparison. Then delete. | 🟡 Low — functional but deprecated |

### Category C: Must Be Updated to New Architecture

| # | File/Code | Issue | Required Update | Risk |
|---|---|---|---|---|
| C1 | **50+ `require()` / `getDefault()` calls across commands** | Every command uses `const getDefault = (m: any) => m?.default ?? m;` then `require()` inside method bodies. CJS lazy-loading pattern in an ESM codebase. `getDefault` is **re-declared locally in 20+ files**. | Extract `getDefault` to a util. Better: resolve services from DI container at command construction time instead of per-execution `require()`. | 🟠 High — pervasive pattern |
| C2 | `src/middleware/access.ts` (525 lines) | **Kitchen sink.** Combines: RateLimiter class, DistributedRateLimiter class, 5+ permission validators, NSFW check, access control, maintenance check, embed helpers, duplicate URL validation. | Split into `rateLimiter.ts`, `permissions.ts`, `checks.ts`. Move embed helpers to `utils/embeds.ts`. Remove duplicate `validateVideoUrl()` (exists in `urlValidator.ts`). | 🟡 Medium |
| C3 | `src/events/BaseEvent.ts` — no error wrapper | BaseCommand has `execute()` wrapping `run()` with try/catch, metrics, logging. BaseEvent has **nothing equivalent**. Each event handles errors ad hoc. `guildDelete.ts` has **no error handling at all**. | Add `safeExecute()` wrapper to `BaseEvent` analogous to `BaseCommand.execute()`. | 🟠 High — crash risk |
| C4 | `src/commands/general/afk.ts` — exports `onMessage()` | Command file exports an event-handling function. Imported by `messageCreate.ts`. Boundary violation: commands should not contain event logic. | Extract to `handlers/general/afkHandler.ts`. | 🟡 Medium |
| C5 | `src/events/guildMemberAdd.ts` — inline anti-raid logic | ~100 lines of suspicious account scoring, raid threshold checking inline in the event. Should live in `AntiRaidService` or `handlers/moderation/`. | Extract to service layer. | 🟡 Medium |
| C6 | `src/cache/music/QueueCache.ts` — holds Discord `Message` objects | Each `MusicQueue` stores `nowPlayingMessage`, `controlsMessage`, `skipVoteMessage` — full Discord.js `Message` instances that hold reference chains to `Client`, `Guild`, `Channel`. At 1000+ concurrent queues this is **extreme memory waste**. | Store only `messageId` + `channelId`. Fetch when needed (rare — only for edits). | 🟠 High — memory |
| C7 | `src/cache/music/QueueCache.ts` — `isLooping` duplicates `loopMode` | `isLooping: boolean` is a derived property of `loopMode: 'off' | 'track' | 'queue'` but stored independently. Risk of desync. | Remove `isLooping`. Derive from `loopMode !== 'off'`. | 🟡 Low |
| C8 | `src/cache/music/QueueCache.ts` — vote state duplicates `VoteCache` | `skipVotes`, `skipVoteActive`, `skipVoteTimeout`, `skipVoteMessage`, `skipVoteListenerCount`, `priorityQueue`, `priorityVotes` in `MusicQueue` overlap with `VoteCache.SkipVoteSession`. Two sources of truth. | Single source of truth. Either `VoteCache` or `QueueCache` owns vote state — not both. | 🟡 Medium |

### Category D: Keep but Isolate (Danger Zone)

| # | File/Code | Why Keep | Why Dangerous | Isolation Strategy | Risk |
|---|---|---|---|---|---|
| D1 | `src/services/music/MusicFacade.ts` (934 lines) | Central music orchestrator. Everything routes through it. | 19+ `as any` casts (documented but not fixed). Orchestration AND business logic mixed. `isTransitioning` flag with setTimeout race window. Direct cache access bypasses `QueueService`. | Add integration tests BEFORE any modification. Do not refactor without test coverage. Mark as frozen. | 🔴 Critical |
| D2 | `src/commands/admin/automod.ts` (~1100 lines) | Full automod settings panel with interactive UI | God file. Entire interactive panel with UI, collectors, embed building, settings mutation. Impossible to unit test. | Split into `AutomodPanel.ts` (UI), `AutomodSettings.ts` (logic), `AutomodEmbeds.ts` (display). | 🟠 High |
| D3 | `src/handlers/music/trackHandler.ts` (~1074 lines) | Embed creation and queue display | Massive file. Button rows, pagination, queue rendering. Changes here affect all music UI. | Split: `TrackEmbed.ts`, `QueueEmbed.ts`, `MusicButtons.ts`. | 🟠 High |
| D4 | `src/services/guild/ShardBridge.ts` — eval handler | Cross-shard code execution | `eval` request type executes arbitrary code via Redis pub/sub, gated only by `ALLOW_SHARD_EVAL` flag. If accidentally enabled: **RCE vector**. | Remove eval entirely or add cryptographic signing to eval payloads. | 🔴 Security |

---

## 4. Architectural Drift & Inconsistencies

### 4.1 `require()` / `getDefault()` vs DI Container (The Dominant Drift)

The DI container is well-designed and has 50+ services registered. But almost no command resolves services from the container. Instead, **50+ files** use this pattern:

```typescript
const getDefault = (m: any) => m?.default ?? m;
// later, inside methods:
const service = getDefault(require('../../services/some/Service.js'));
```

This pattern:
- Re-declares `getDefault` in every file (20+ copies of the same 1-line function)
- Uses CJS `require()` inside an ESM codebase
- Calls `require()` inside method bodies on every command execution (Node caches the result, but the destructuring + cast happens every call)
- Completely bypasses the DI container that was specifically built for this purpose

The container exists. The services are registered. But the commands don't use it. This is the single biggest architectural inconsistency.

### 4.2 Three Competing Cooldown Systems

| System | Location | Backing | Shard-Safe |
|---|---|---|---|
| `BaseCommand._cooldowns` | `src/commands/BaseCommand.ts` | In-memory `Map` | ❌ No |
| `DistributedRateLimiter` | `src/middleware/access.ts` | Redis via CacheService | ✅ Yes |
| `CooldownManager` | `src/utils/common/cooldown.ts` | CacheService (Redis) | ✅ Yes |

Plus per-command rate limiting in `video.ts` (4 in-memory Maps + setInterval), `anime.ts` (in-memory autocomplete cache + setInterval).

`BaseCommand` uses the in-memory cooldowns for ALL commands. Users can bypass by hitting a different shard. The Redis-based alternatives exist but aren't wired into BaseCommand.

### 4.3 Three Logger Implementations

| Logger | Location | Used By |
|---|---|---|
| Core `Logger` singleton | `src/core/Logger.ts` | All core + services (after migration) |
| Custom `logger` fallback objects | `src/repositories/api/animeRepository.ts`, `nhentaiRepository.ts` | Repositories that define `const logger = { info: console.log, ... }` |
| Feature-specific loggers | `src/utils/deathbattle/logger.ts`, `src/utils/say/logger.ts` | Death battle and say features |

The feature-specific loggers bypass the centralized Logger entirely. They fetch Discord channels on every log call (no caching), use `console.log` directly, and share the system log channel with other features.

### 4.4 Handler Layer — Inconsistent Value

| Domain | Pattern | Value |
|---|---|---|
| Music handlers | Classes with `.bind()`, clear delegation from MusicCommand | **HIGH** — good separation |
| Moderation handlers | Plain function exports | **MEDIUM** — adds adapter value |
| API handlers | Function exports (embed builders) | **LOW** — just embed construction, could be utils |

Three different organizational patterns for the same architectural layer.

### 4.5 Config Not Centralized

| Config | Defined In | Should Be In |
|---|---|---|
| Deathbattle config | `src/config/deathbattle/` | Not exported from `src/config/index.ts` — imported directly |
| Say config | `src/config/say/` | Not exported from `src/config/index.ts` — imported directly |
| Music log channel ID | `src/config/features/music.ts` L45 | **Hardcoded Discord channel ID** in source — must be env var |
| Cobalt instances | `src/config/services.ts` (1 instance on port 9000) | Contradicts `src/config/features/video.ts` (3 instances on ports 9001-9003) |
| AutoPlay years | `src/services/music/autoplay/AutoPlayService.ts` L215 | Hardcoded `"2024"`, `"2023"` — should use `new Date().getFullYear()` |

### 4.6 Eviction Strategy Claims vs Reality

Multiple files claim "LRU eviction" but implement **FIFO** (first-in, first-evicted via Map insertion order):

| File | Claim | Reality |
|---|---|---|
| `CacheService.ts` `_evictLRU()` | LRU | FIFO — deletes first key in insertion order |
| `pixivCache.ts` `_evictOldest()` | Oldest by access | FIFO — same pattern |
| `redditCache.ts` `_evictOldest()` | Oldest by update | O(n) scan for oldest `updatedAt` — actual LRU, but expensive |
| `rule34Cache.ts` `_evictOldest()` | LRU | FIFO |
| `GuildMusicCache.ts` `_evictOldest()` | LRU | FIFO with `as any` type erasure |

This means frequently accessed cache entries can be evicted while rarely-accessed ones survive. Under load, this causes unnecessary cache misses for hot data.

### 4.7 Inline DDL in Repositories

`animeRepository.ts` and `nhentaiRepository.ts` both run `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE` on first use. DDL should be in `docker/init/` SQL scripts with version control, not runtime-executed in application code.

### 4.8 Module-Scope Side Effects

| File | Side Effect | Impact |
|---|---|---|
| `src/commands/video/video.ts` L224 | `setInterval()` for rate limit cleanup | Timer starts on import, even in tests |
| `src/commands/api/anime.ts` L97 | `setInterval()` for autocomplete cache cleanup | Timer starts on import, even in tests |
| `src/core/metrics.ts` | `collectDefaultMetrics()` | Default metrics collection starts on import |

These break test isolation and waste resources if the module is imported but the feature isn't used.

---

## 5. GO / NO-GO Decision

### 🟡 CONDITIONAL GO — With Mandatory Pre-Scaling Fixes

The system **can run at current scale** (estimated <500 servers, single shard). It has strong infrastructure foundations that most Discord bots never build. The previous refactors were substantial and real.

However, **scaling to 1000+ servers with multi-shard deployment has 5 blocking issues**:

| # | Blocker | Impact If Ignored | Effort to Fix |
|---|---|---|---|
| 1 | Health port collision | Multi-shard startup crash | 1 hour |
| 2 | GracefulDegradation Redis key collision | Duplicate writes on recovery | 2 hours |
| 3 | `KEYS *` in CacheService | Redis stalls under load | 30 min |
| 4 | Test coverage at 2/10 | Silent regressions, fear-driven development | 30-40 hours |
| 5 | `getNextCaseId()` race condition | Duplicate moderation case IDs | 30 min |

**Blockers 1, 2, 3, 5 are fast fixes (4 hours total).** Blocker 4 (testing) is the structural gap.

### Minimum Requirements for Full GO

| Step | Effort | Status |
|---|---|---|
| Fix health port to be shard-aware | 1 hour | ✅ Fixed (2026-02-13) |
| Scope GracefulDegradation Redis keys by shard | 2 hours | ✅ Fixed (2026-02-13) |
| Replace `KEYS` with `SCAN` in `clearNamespace` | 30 min | ✅ Fixed (2026-02-13) |
| Fix `getNextCaseId` to use atomic INSERT | 30 min | ✅ Fixed (2026-02-13) |
| Add BaseEvent error wrapper | 2 hours | ✅ Fixed (2026-02-13) |
| Remove QueueCache Message object storage | 4 hours | ✅ Fixed (2026-02-13) |
| Minimum test suite (BaseCommand, CacheService, postgres) | 20 hours | ⬜ |

**Total: ~30 hours to full GO.**

---

## 6. Cleanup & Stabilization Plan

### Phase A: Zero-Risk Deletions (Day 1 — 2 hours) ✅ COMPLETED (2026-02-13)

Dead code removed with zero functional impact. Build verified with `tsc --noEmit` — no errors.

| # | Action | Files | Status |
|---|---|---|---|
| 1 | Delete unused `httpClient.ts` | `src/utils/common/httpClient.ts` | ✅ Deleted |
| 2 | Delete dead exports from `src/utils/music/index.ts` | `formatTimeAgo`, `formatViewCount`, `formatNumber`, `truncateText`, `formatTimestamp` | ✅ Removed |
| 3 | Delete dead exports from `src/utils/common/time.ts` | `unixTimestamp`, `isToday`, `startOfDay`, `endOfDay` | ✅ Removed |
| 4 | Delete dead exports from `src/utils/common/apiUtils.ts` | `withTimeout`, `withTimeoutAndRetry`, `RateLimiter` class, `TimeoutRetryOptions` interface | ✅ Removed |
| 5 | Remove dead `os` import from `Logger.ts` | 1 line | ✅ Removed |
| 6 | Remove dead `Summary` import from `metrics.ts` | 1 line | ✅ Removed |
| 7 | Remove dead `finalize()` from `LavalinkService.ts` | Empty method + call site in `index.ts` | ✅ Removed |
| 8 | Remove dead `buttonHandlers`/`selectMenuHandlers` from `CommandRegistry.ts` | Unused Maps + `.clear()` calls | ✅ Removed |
| 9 | Remove dead `getStats()` from `SnipeService.ts` | Returns hardcoded zeros + default export entry | ✅ Removed |
| 10 | Remove dead `getStats()`/`destroy()` from `cooldown.ts` | No-ops + `CooldownStats` interface | ✅ Removed |
| 11 | ~~Remove adapter aliases from `pixivCache.ts`~~ | `getSearchResults`, `setSearchResults`, `updateSearchResults` | ⚠️ **SKIPPED** — actively used by `pixiv.ts` (not dead code) |
| 12 | Remove `isUserAfk()` alias chain | `AfkRepository.ts` method + `afk.ts` wrapper + `general/index.ts` re-export | ✅ Removed (3 files) |

### Phase B: Critical Fixes (Week 1 — 10 hours) ✅ COMPLETED (2026-02-13)

All 6 blocking issues for multi-shard deployment fixed. Build verified with `tsc --noEmit` — no errors.

| # | Action | Scope | Status |
|---|---|---|---|
| 1 | Fix health port: `base_port + shard_id` | `src/index.ts` — port now computed as `basePort + shardId` | ✅ Fixed |
| 2 | Scope GracefulDegradation Redis keys by shard ID | `src/core/GracefulDegradation.ts` — key is now `graceful:writequeue:pending:shard:{shardId}`, `setShardId()` called on ready | ✅ Fixed |
| 3 | Replace `KEYS` with `SCAN` in `clearNamespace` | `src/cache/CacheService.ts` — uses SCAN cursor loop (same pattern as `clearUserCooldowns`) | ✅ Fixed |
| 4 | Fix `getNextCaseId` — atomic INSERT with sub-select | `src/repositories/moderation/InfractionRepository.ts` — `SELECT MAX FOR UPDATE` in a single INSERT statement | ✅ Fixed |
| 5 | Add `safeExecute()` to `BaseEvent` | `src/events/BaseEvent.ts` + `src/services/registry/EventRegistry.ts` — all events now wrapped in try/catch error boundary | ✅ Fixed |
| 6 | Remove Discord `Message` storage from `QueueCache` | `QueueCache.ts`, `MusicCacheFacade.ts`, `VoteCache.ts`, `MusicFacade.ts`, `PlaybackEventHandler.ts`, `playHandler.ts` — stores lightweight `MessageRef { messageId, channelId }` instead of full Message objects, lazy-fetched when needed | ✅ Fixed |

### Phase C: Structural Debt Reduction (Week 2–3 — 16 hours) ✅ COMPLETED (2025-06-13)

All 7 structural debt items resolved. Build verified with `tsc --noEmit` — no errors.

| # | Action | Scope | Status |
|---|---|---|---|
| 1 | Extract `getDefault()` to shared util, reduce `require()` calls | Created `src/utils/common/moduleHelper.ts`. 34 files updated to import shared `getDefault()` instead of local declarations. | ✅ Done |
| 2 | Split `access.ts` kitchen sink | `src/middleware/access.ts` (525 lines) → 4 focused files: `rateLimiter.ts`, `permissions.ts`, `checks.ts`, `embeds.ts`. Original file is now a thin re-export layer (~45 lines). | ✅ Done |
| 3 | Extract `afk.onMessage()` to handler | Created `src/handlers/general/AfkHandler.ts`. `messageCreate.ts` imports from handler. Original `onMessage()` in `afk.ts` marked `@deprecated`. | ✅ Done |
| 4 | Extract `guildMemberAdd` raid logic to service | Created `src/handlers/moderation/AntiRaidHandler.ts`. `guildMemberAdd.ts` reduced from ~172 to ~45 lines. Bug fix: implemented missing `checkAccountAge()` on `AntiRaidService`. | ✅ Done |
| 5 | Unify cooldown on `CooldownManager` (Redis) | `BaseCommand._cooldowns` Map removed. `_checkCooldown()` and `_setCooldown()` now async, backed by `globalCooldownManager` (Redis via CacheService). Shard-safe, TTL-managed. | ✅ Done |
| 6 | Remove `isLooping` / consolidate vote state in `QueueCache` | Removed `isLooping` field (already managed by `GuildMusicCache`). Removed 7 vote fields from `QueueCache` — `VoteCache` is now single source of truth. Added helper methods to `MusicCacheFacade`. | ✅ Done |
| 7 | Fix Sentry missing shard_id tag | Added `setShardId()` to `src/core/sentry.ts`, called from `index.ts` on ready. `captureException` now includes `shard_id` in scope. | ✅ Done |

### Phase D: Test Coverage Foundation (Week 3–6 — 30 hours)

| # | Test Target | Priority | Effort |
|---|---|---|---|
| 1 | `BaseCommand` lifecycle (cooldown, defer, error handling) | 🔴 Critical | 4 hours |
| 2 | `CacheService` (set/get/delete, namespace, eviction, Redis fallback) | 🔴 Critical | 4 hours |
| 3 | `postgres.ts` (retry, read replica routing, graceful degradation) | 🔴 Critical | 4 hours |
| 4 | `CircuitBreaker` state transitions (CLOSED → OPEN → HALF_OPEN) | 🟠 High | 3 hours |
| 5 | `GracefulDegradation` fallback chain | 🟠 High | 3 hours |
| 6 | `Result` pattern (map, flatMap, unwrap, toDiscordEmbed) | 🟡 Medium | 2 hours |
| 7 | Moderation repositories (infractions, filters, mod log) | 🟠 High | 4 hours |
| 8 | `MusicFacade` integration (play, skip, queue, autoplay) | 🔴 Critical | 6 hours |

---

## 7. Top 5 Highest-Leverage Next Actions

Ranked by effort-to-impact ratio. *(Updated 2025-06-13 after Phase B + C completion)*

### 1. ~~Fix Multi-Shard Blockers~~ ✅ DONE (Phase B)
Health port, GracefulDegradation key scoping, KEYS→SCAN, getNextCaseId — all fixed.

### 2. ~~Add BaseEvent Error Wrapper~~ ✅ DONE (Phase B5)
`safeExecute()` added to BaseEvent, all events wrapped.

### 3. ~~Remove QueueCache Message Object Storage~~ ✅ DONE (Phase B6)
Now stores lightweight `MessageRef { messageId, channelId }`.

### 4. Write CacheService + postgres.ts Tests (8 hours → validates the two pillars)
These two modules underpin everything. CacheService handles all caching for 50+ services. postgres.ts handles all database access. Testing these two validates the reliability of the entire system's data layer. **This is now the #1 priority — Phase D.**

### 5. ~~Centralize `getDefault`/`require` Pattern~~ ✅ DONE (Phase C1)
Shared `getDefault()` in `src/utils/common/moduleHelper.ts`. 34 files migrated.

---

## Appendix A: File Risk Heatmap

| Risk Level | Files | Reason |
|---|---|---|
| 🔴 **Do Not Touch Without Tests** | `MusicFacade.ts` (934 lines), `CacheService.ts` (1,205 lines), `postgres.ts` (892 lines) | Central infrastructure. Extensive state. Type-unsafe casts. Any bug cascades. |
| 🟠 **Touch Carefully** | `index.ts` (408 lines), `LavalinkService.ts`, `BattleService.ts` (~1,250 lines), `automod.ts` (~1,100 lines), `trackHandler.ts` (~1,074 lines), `shutdown.ts` | Complex orchestration, heavy state, or broad coupling. |
| 🟡 **Moderate Risk** | All API services, `GuildMusicCache.ts`, `PlaybackService.ts`, `QueueService.ts`, `QueueCache.ts`, `BaseCommand.ts`, `access.ts` | State management or wide consumer surface. |
| 🟢 **Safe to Modify** | All moderation services, all event files, `constants.ts`, `config/*`, most `utils/*`, `Result.ts`, `ErrorCodes.ts` | Well-bounded, low coupling, or stateless. |

## Appendix B: Shard Safety Matrix (Updated)

| Status | Components |
|---|---|
| ✅ **Shard-Safe** (Redis/DB) | CacheService, GuildSettings, all Moderation (8), ShardBridge, UserMusicCache, all Repositories, Pixiv OAuth, Reddit OAuth, MAL rate limiter, NHentaiHandler sessions, BaseCommand cooldowns (Phase C5), Health server port (Phase B1), GracefulDegradation write queue key (Phase B2) |
| ❌ **Shard-Unsafe** (needs fix) | PaginationState |
| ⚠️ **Shard-Local by Design** (acceptable) | QueueService, PlaybackService, MusicFacade, MusicEventBus, AutoPlayService, VoteCache, GuildMusicCache, BattleService, CommandRegistry, EventRegistry |

## Appendix C: Dependency Issues

| Issue | Location | Severity |
|---|---|---|
| `@distube/yt-dlp`, `@distube/ytdl-core`, `ytdl-core`, `yt-dlp-exec`, `yt-dlp-wrap` | `package.json` | 5 packages for the same purpose (YouTube downloading). Likely only 1-2 are actually used. |
| `shoukaku` + `lavalink-client` | `package.json` | Two Lavalink client libraries. Verify which is active. |
| `node-fetch` | `package.json` | Node 20 has built-in `fetch`. This dependency may be unnecessary. |
| `knex` | `package.json` | Migration tool present but raw `pg` is used for all queries. Knex is only for migrations. This is fine but should be a devDependency. |
| `noUnusedLocals: false`, `noUnusedParameters: false` | `tsconfig.json` | Deliberately relaxed. This allows dead code to accumulate without compiler warnings. |

## Appendix D: Circuit Breaker Logic Bug

**File:** `src/core/CircuitBreaker.ts` — `_onFailure()` method

The failure counter increments regardless of the `isFailure` predicate result:

```
1. Error thrown by wrapped function
2. _onFailure(error) called
3. failureCount++ (ALWAYS happens)
4. isFailure(error) checked (AFTER increment)
5. If isFailure returns false → error re-thrown, but counter already incremented
```

This means non-failure errors (e.g., business logic errors, validation errors) still contribute to tripping the circuit. The counter should only increment when `isFailure(error)` returns true.

Additionally, the Discord circuit's `isFailure` function checks `err.code !== 429` — but discord.js uses string error codes like `'RateLimited'`, not HTTP status code `429`. The numeric check will never match, making the filter ineffective.

## Appendix E: Anti-Patterns Inventory

| Anti-Pattern | Location | Description |
|---|---|---|
| `async` inside `new Promise()` | `VideoProcessingService.processForMobile` | If the async body throws, the rejection is unhandled by the wrapping Promise. |
| EventEmitter inheritance without events | `src/utils/video/progressAnimator.ts` | Extends EventEmitter but never emits or listens to any events. |
| `_suppressMissMetric` flag | `CacheService.ts` | Mutable class-level boolean used as a side-channel to suppress metrics. Should be an options parameter on `get()`. |
| `require('../../database/index.js')` in service methods | Multiple moderation services, guild settings | CJS require inside method bodies for circular dep avoidance. Should use DI container. |
| `dotenv.config({ path: '../.env' })` | `src/services/api/steamService.ts` | Relative path from `__dirname` of compiled output. Will resolve incorrectly if build output structure changes or in Docker. |
| RegExp objects in config | `src/config/features/moderation/automod.ts`, `filters.ts` | `RegExp[]` won't survive JSON serialization through Redis. Should be string patterns compiled at use-time. |
| Hardcoded CDN URLs for thumbnails | `src/config/deathbattle/skillsets/*.ts` | DeviantArt, Imgur, Steam CDN links that will break when CDN changes. |
| `caps_percent` + `caps_percentage` | `AutoModRepository.ts` | Two fields for the same concept — legacy rename not cleaned up. |
| `ModLogUpdateData` mixed casing | `ModLogRepository.ts` | Both snake_case and camelCase variants of every field in the same interface. |

---

*End of revalidation. The system has strong bones — DI container, Result pattern, circuit breakers, graceful degradation, unified cache, moderation stack. The previous review and resulting fixes were substantial and real. The remaining work is primarily: multi-shard safety fixes (4 hours), structural debt reduction (16 hours), and test coverage (30 hours). The highest risk is shipping changes without tests. Fix the 5 blockers, write tests for CacheService and postgres.ts, and this system is ready for 1000+ servers.*
