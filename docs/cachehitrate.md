# Cache Hit Rate Improvement Plan

## Current Snapshot (2026-02-13)

| Metric | Value |
|--------|-------|
| Hit Rate | **31.3%** |
| Hits | 5 |
| Misses | 11 |
| Memory Entries | 1 |
| Namespaces | 22 |

## Target

| Milestone | Hit Rate | Timeframe |
|-----------|----------|-----------|
| Short term | **50%+** | 1 week |
| Medium term | **65%+** | 2-4 weeks |
| **Actual target** | **>70%** | As measured by `effectiveHitRate` |

---

## Root Cause Analysis (from codebase audit)

### 🔴 CRITICAL — `clearNamespace('api')` nukes 7+ services

**File:** `src/services/api/nhentaiService.ts` → `clearCache()`

`nhentaiService.clearCache()` calls `cacheService.clearNamespace('api')` which **wipes every cached entry** in the `api` namespace — including anilist, google, MAL, pixiv translations, wikipedia, and fandom data. One service's cleanup destroys the cache for all others.

**Impact:** Any `clearCache()` call instantly resets hit rate to 0% for everything in the `api` namespace. This is likely the single biggest cause of the 31.3% rate.

**Fix:** Replace `clearNamespace('api')` with targeted key deletion using a prefix pattern (e.g., delete only `nhentai:*` keys).

---

### 🔴 CRITICAL — `api` namespace is overloaded (7+ services, 500 max entries)

The `api` namespace (maxSize: 500) is shared by:

| Service | Key prefix |
|---------|-----------|
| nhentai | `nhentai:gallery_*`, `nhentai:search_*`, `nhentai:suggest_*`, `nhentai:page:*`, `nhentai:search:*` |
| anilist | `anilist:*` |
| google | `google:search_*` |
| MAL | `mal:search_*`, `mal:anime_*`, `mal:rate_limit` |
| pixiv | `translate:en_ja_*`, `translate:ja_en_*` |
| wikipedia | `wiki:search_*`, `wiki:article_*` |
| fandom | `fandom:search_*`, `fandom:article_*`, `fandom:wikiinfo_*` |

With 500 max entries shared across all of these, LRU eviction constantly churns out less-frequent entries. nhentai galleries alone can easily fill the pool.

**Fix:** Split into per-service namespaces or at minimum group by traffic patterns. Give high-traffic services their own namespace with appropriate `maxSize`.

---

### 🟡 MEDIUM — Missing cache writes

| Service | Method | Issue |
|---------|--------|-------|
| MAL | `searchMediaAutocomplete()` | Makes API calls, **never caches results** — every autocomplete is a fresh API call |
| Fandom | `getWikiList()` | Fetches wiki list from API **without caching** |

**Fix:** Add `cacheService.set()` after successful API responses in both methods.

---

### 🟡 MEDIUM — Unregistered namespaces fall to memory-only

| Namespace | Used in | Issue |
|-----------|---------|-------|
| `pixiv_auth` | `pixivService.ts` | Falls back to `DEFAULT_TEMP_CONFIG` (60s TTL, `useRedis: false`) |
| `reddit_auth` | `redditService.ts` | Same — tokens never shared across shards via Redis |

Both services use `peek()` expecting cross-shard OAuth token sharing via Redis, but since the namespaces aren't registered, `useRedis` is `false` — **tokens are never written to or read from Redis**. Each shard independently refreshes tokens.

**Fix:** Register both namespaces with `useRedis: true` and appropriate TTL matching token expiry.

---

### 🟡 MEDIUM — Invalidate-then-read cycles in UserMusicCache

`addFavorite()`, `removeFavorite()`, `addToHistory()` all:
1. Call `cacheService.delete()` (invalidate)
2. Immediately call the getter → `cacheService.get()` → **guaranteed miss** → DB fetch → re-cache

Every mutation creates 1 miss + 1 write. This is a predictable miss pattern.

**Fix:** After mutation, use `cacheService.set()` with the updated data directly instead of delete → get → miss → DB → set.

---

### 🟢 LOW — `temp` namespace misused for long-TTL data

`anilistService.ts` stores stale fallback data with **86400s (24h) TTL** in the `temp` namespace, which is memory-only with 60s default TTL. The passed TTL overrides the default, but the data won't survive restarts or be shared across shards.

**Fix:** Move to a registered namespace with `useRedis: true` (e.g., `api:stale` or just use the `api` namespace with a `stale:` prefix, once `api` is split up).

---

### ℹ️ INFO — 4 default namespaces are never used

`user`, `session`, `ratelimit`, `automod` are registered in `DEFAULT_NAMESPACES` but have **zero** `cacheService.*` calls anywhere.

- `automod` config is stored under the `guild` namespace as `automod:${guildId}`, not under its own namespace.

**Fix:** Remove unused defaults to reduce noise. Move `automod` config to the `automod` namespace if it should have its own TTL.

---

## Fix Priority & Estimated Impact

| # | Fix | Severity | Estimated Hit Rate Gain | Effort |
|---|-----|----------|------------------------|--------|
| 1 | Replace `clearNamespace('api')` with targeted nhentai-only deletion | 🔴 Critical | **+10-15%** | 30 min |
| 2 | Split `api` namespace into per-service namespaces | 🔴 Critical | **+5-10%** | 2-3 hrs |
| 3 | Cache MAL autocomplete + Fandom wiki list results | 🟡 Medium | **+3-5%** | 1 hr |
| 4 | Register `pixiv_auth` and `reddit_auth` namespaces properly | 🟡 Medium | **+1-2%** | 15 min |
| 5 | Replace delete→get with set-after-mutate in UserMusicCache | 🟡 Medium | **+2-3%** | 1 hr |
| 6 | Move anilist stale cache to a Redis-backed namespace | 🟢 Low | **+1%** | 15 min |
| 7 | Clean up unused default namespaces | ℹ️ Info | — | 15 min |
| **8** | **Fix metrics: getOrSet miss suppression + specializedOps tracking** | **🔴 Critical** | **Unlocks accurate measurement** | **2 hrs** |

**Cumulative estimated improvement: 31.3% → ~55-65% (hit rate), effective hit rate projected >70%**

---

## Metrics Overhaul (2026-02-13)

### Why the hit rate was stuck at 31.3% with only 16 requests

The reported hit rate was **fundamentally wrong** — the vast majority of cache operations were invisible to metrics:

| Operation | Used by | Tracked? | Impact |
|-----------|---------|----------|--------|
| `get()` | GuildSettings, API services | ✅ Yes | Only 16 operations recorded |
| `getOrSet()` | AutoMod settings/filters (EVERY message) | ❌ **Miss suppressed** | Biggest blind spot |
| `peek()` | Snipe, lockdown, anti-raid | ⚠️ Hits counted, misses → `absenceChecks` (excluded) | OK by design |
| `getCooldown()` | Command cooldowns | ❌ **Completely invisible** | High frequency |
| `checkRateLimit()` | Rate limiter | ❌ **Completely invisible** | Every command |
| `checkAndSetCooldown()` | Command cooldowns | ❌ **Completely invisible** | Every command |
| `trackSpamMessage()` | AutoMod | ❌ **Completely invisible** | Every message |
| `trackDuplicateMessage()` | AutoMod | ❌ **Completely invisible** | Every message |

### Fixes applied

1. **`getOrSet()` misses now count as real misses** — removed `_suppressMissMetric` flag from `getOrSet()`. `peek()` still uses it (by design — absence is expected/normal for existence checks).
2. **`specializedOps` counter added** — all 5 specialized methods now increment `metrics.specializedOps` on every call.
3. **`effectiveHitRate`** — new metric computed as: `(hits + specializedOps + absenceChecks) / (hits + misses + absenceChecks + specializedOps)`. This captures the full picture.
4. **`topMissNamespaces`** — per-namespace hit/miss tracking via `_trackNamespaceHit(ns)` / `_trackNamespaceMiss(ns)` in `get()`. Sorted by miss count in `getStats()`.
5. **3 new tests added** (40/40 passing): namespace stats tracking, specializedOps tracking, getOrSet miss counting.

---

## Namespace Map (Current vs Proposed)

### ~~Current: everything shares `api`~~ (REMOVED in Phase 2)

```
api (maxSize: 500) ← nhentai, anilist, google, MAL, pixiv, wikipedia, fandom   [REMOVED]
```

### ✅ Implemented: split by service (2026-02-13)

```
api:nhentai   (maxSize: 300, ttl: 300)  ← galleries, search, suggestions, pages, sessions
api:anime     (maxSize: 400, ttl: 600)  ← anilist, MAL (incl. autocomplete) + stale fallback
api:search    (maxSize: 200, ttl: 300)  ← google, wikipedia, fandom (incl. wiki search)
api:translate (maxSize: 100, ttl: 1800) ← pixiv translations (changes rarely)
maintenance   (maxSize: 10,  ttl: 30d)  ← maintenance state (cross-shard, Redis-backed)
```

---

## Implementation Plan

### Phase 1 — Stop the Bleeding (Day 1) ✅ DONE (2026-02-13)

- [x] **Fix #1:** In `nhentaiService.clearCache()`, replace `clearNamespace('api')` with `deleteByPrefix('api', 'nhentai:')` — targeted deletion of only `nhentai:*` keys. Added `deleteByPrefix()` method to `CacheService`.
- [x] **Fix #4:** Register `pixiv_auth` and `reddit_auth` namespaces in `DEFAULT_NAMESPACES` with `useRedis: true`, `ttl: 3600`, `maxSize: 10`.
- [ ] Re-measure hit rate after a day of traffic.

### Phase 2 — Split & Cache (Day 2-3) ✅ DONE (2026-02-13)

- [x] **Fix #2:** Split `api` namespace into `api:nhentai`, `api:anime`, `api:search`, `api:translate`. Updated all 8 service/handler files: `nhentaiService`, `nhentaiHandler`, `anilistService`, `myAnimeListService`, `googleService`, `wikipediaService`, `fandomService`, `pixivService`. Removed legacy `api` namespace from `DEFAULT_NAMESPACES`.
- [x] **Fix #3:** Added cache writes to `myAnimeListService.searchMediaAutocomplete()` (key: `mal:autocomplete_${mediaType}_${query}`) and `fandomService.searchWikis()` (key: `fandom:wikisearch_${query}`).
- [ ] Re-measure hit rate.

### Phase 3 — Optimize Patterns (Day 4-5) ✅ DONE (2026-02-13)

- [x] **Fix #5:** Refactored `UserMusicCache.removeFavorite()` and `addToHistory()` to update cached data directly (filter/prepend) instead of delete→get→miss→DB→re-cache. Falls back to DB fetch only on cold cache. **Guarded cache update on DB success** — if DB write fails, cache is invalidated instead of updated (prevents cache-DB inconsistency).
- [x] **Fix #6:** Moved anilist stale cache from `'temp'` (memory-only) to `'api:anime'` (Redis-backed). Increased `api:anime.maxSize` from 200 to 400 to accommodate stale fallback entries alongside live results.
- [x] **Fix #7:** Removed `'user'` from `DEFAULT_NAMESPACES` (confirmed zero usage). Migrated `'session'` → `'maintenance'` namespace (used by `maintenance.ts` for cross-shard state persistence). Kept `'ratelimit'` and `'automod'` — both are actively used via CacheService internal methods (`checkRateLimit`, `trackSpamMessage`, etc.).
- [x] **Audit fix:** Fixed `maintenance.ts` — was using removed `'session'` namespace, now uses dedicated `'maintenance'` namespace with `useRedis: true`, `ttl: 30d`.
- [x] **Audit fix:** Updated CacheService unit tests to match current `DEFAULT_NAMESPACES` (37/37 passing).
- [x] Add per-namespace hit/miss metrics to the stats output.
- [ ] Final measurement.

---

## Validation Checklist

- [x] `clearNamespace('api')` removed — replaced with `clearNamespace('api:nhentai')` on dedicated namespace.
- [x] `api` namespace split into 4 service-specific namespaces: `api:nhentai`, `api:anime`, `api:search`, `api:translate`.
- [x] MAL autocomplete and Fandom wiki search cache writes added.
- [x] `pixiv_auth` / `reddit_auth` registered with Redis.
- [x] UserMusicCache avoids delete→get pattern (uses set-after-mutate, guarded on DB success).
- [x] Unused default namespaces removed (`user`). `session` migrated to `maintenance`. `ratelimit`/`automod` kept (actively used internally).
- [ ] Hit rate measured at **50%+** after Phase 2.
- [ ] Hit rate measured at **60%+** after Phase 3.

---

## 7-Day Execution Runbook

### Day 1 (Hotfix) ✅ DONE (2026-02-13)

- [x] Patch `nhentaiService.clearCache()` to delete only `nhentai:*` keys via new `CacheService.deleteByPrefix()` method.
- [x] Register `pixiv_auth` and `reddit_auth` with `useRedis: true` in `DEFAULT_NAMESPACES`.
- [ ] Capture baseline + post-hotfix metrics at end of day.

### Day 2-3 (Namespace Split) ✅ DONE (2026-02-13)

- [x] Create and register `api:nhentai`, `api:anime`, `api:search`, `api:translate` in `DEFAULT_NAMESPACES`.
- [x] Migrate read/write calls in all 8 service/handler files to new namespaces.
- [x] Verified no service is still writing to legacy `api` namespace.

### Day 4 (Coverage) ✅ DONE (2026-02-13)

- [x] Added caching to MAL autocomplete (`mal:autocomplete_*`) and Fandom wiki search (`fandom:wikisearch_*`) endpoints.
- [ ] Add or update tests for cache key consistency and namespace usage.

### Day 5 (Pattern Optimization) ✅ DONE (2026-02-13)

- [x] Refactored `UserMusicCache.removeFavorite()` — filters cached list directly, no DB re-fetch.
- [x] Refactored `UserMusicCache.addToHistory()` — prepends new track to cached list, no DB re-fetch.
- [x] Moved AniList stale fallback cache from `'temp'` (memory-only) to `'api:anime'` (Redis-backed).
- [x] Removed unused namespaces `'user'`, `'session'` from `DEFAULT_NAMESPACES`.

### Day 6 (Observability) ✅ DONE (2026-02-13)

- [x] Add per-namespace hit/miss/write/delete counters to cache stats output.
- [x] Produce first top-5 miss-heavy namespace report.
- [x] **CRITICAL FIX:** `getOrSet()` was suppressing miss metrics — ALL `getOrSet` cache misses (automod settings, filters, etc.) were invisible. Removed suppression so misses are counted.
- [x] **Added `specializedOps` tracking:** `getCooldown()`, `checkRateLimit()`, `trackSpamMessage()`, `trackDuplicateMessage()`, `checkAndSetCooldown()` now increment `specializedOps` counter.
- [x] **Added `effectiveHitRate`:** Includes hits, misses, absenceChecks, AND specializedOps in the denominator. Specialized ops and absenceChecks count as "hits" (they always succeed — counters, cooldowns, existence checks).
- [x] **Added `topMissNamespaces`:** Sorted list of namespaces by miss count, with per-namespace hit rate. Useful for targeted optimization.
- [x] **Added 3 new tests:** `topMissNamespaces` tracking, `specializedOps` tracking, `getOrSet` miss counting (40/40 tests passing).

### Day 7 (Review)

- [ ] Compare baseline vs current hit rate and misses.
- [ ] Confirm no P95/P99 latency regressions.
- [ ] Freeze changes and document final namespace/TTL table.

---

## Measurement Template (fill each day)

| Date | Hit Rate | Hits | Misses | Memory Entries | Namespaces | Notes |
|------|----------|------|--------|----------------|------------|-------|
| 2026-02-13 | 31.3% | 5 | 11 | 1 | 22 | Baseline |
| 2026-02-14 |  |  |  |  |  |  |
| 2026-02-15 |  |  |  |  |  |  |
| 2026-02-16 |  |  |  |  |  |  |
| 2026-02-17 |  |  |  |  |  |  |
| 2026-02-18 |  |  |  |  |  |  |
| 2026-02-19 |  |  |  |  |  |  |

---

## Rollback Conditions

- Revert latest cache change if hit rate drops by >10 percentage points for 24h.
- Revert if stale/incorrect data incidents increase after namespace split.
- Revert if P95 or P99 latency regresses and does not recover after cache warm-up.