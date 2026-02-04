# 🔀 Shard Safety Documentation

> **Last Updated:** February 4, 2026  

This document describes which components of alterGolden are safe for multi-shard deployment and which require careful consideration.

---

## 📊 Shard Safety Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        SHARD ARCHITECTURE                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│    ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐              │
│    │ Shard 0  │   │ Shard 1  │   │ Shard 2  │   │ Shard N  │              │
│    │ Guilds   │   │ Guilds   │   │ Guilds   │   │ Guilds   │              │
│    │ 0-999    │   │ 1000-1999│   │ 2000-2999│   │ ...      │              │
│    └────┬─────┘   └────┬─────┘   └────┬─────┘   └────┬─────┘              │
│         │              │              │              │                     │
│         └──────────────┴──────────────┴──────────────┘                     │
│                               │                                            │
│                    ┌──────────▼──────────┐                                 │
│                    │   SHARED STATE      │                                 │
│                    │                     │                                 │
│                    │  ┌─────────────┐    │                                 │
│                    │  │    Redis    │    │  ← All runtime state            │
│                    │  └─────────────┘    │                                 │
│                    │  ┌─────────────┐    │                                 │
│                    │  │  PostgreSQL │    │  ← Persistent data              │
│                    │  └─────────────┘    │                                 │
│                    └─────────────────────┘                                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## ✅ Shard-Safe Components

These components store all runtime state in Redis and are safe for multi-shard deployment:

### Core Infrastructure

| Component | State Location | TTL | Notes |
|-----------|---------------|-----|-------|
| `CacheService` | Redis + Memory Fallback | Namespace-based | Unified cache abstraction |
| `GracefulDegradation` | Redis (`graceful:writequeue:*`) | 24h | Durable write queue |
| `CircuitBreaker` | Per-shard (stateless) | N/A | State is intentionally local |

### Music System

| Component | State Location | TTL | Notes |
|-----------|---------------|-----|-------|
| `MusicCacheFacade` | Redis (`music:queue:*`) | 1h | Queue data |
| `preservedQueues` | Redis (`music:preserved:*`) | 30m | Lavalink reconnection |
| `inactivityTimers` | Redis (`music:inactivity:*`) | 15m | Voice channel cleanup |
| `vcMonitorActive` | Redis (`music:vcmonitor:*`) | 5m | VC monitoring flags |
| Queue state | Redis | 1h | Tracks, current position |
| Volume settings | Redis | 1h | Per-guild volume |
| Loop mode | Redis | 1h | off/track/queue |

### Moderation System

| Component | State Location | TTL | Notes |
|-----------|---------------|-----|-------|
| `AutoModService.settingsCache` | Redis (`guild:automod:*`) | 5m | AutoMod config |
| `FilterService.filterCache` | Redis (`guild:filters:*`) | 5m | Word filters |
| Spam tracking | Redis (`automod:spam:*`) | 5-10s | Message rate |
| Duplicate tracking | Redis (`automod:duplicate:*`) | 10s | Content hash |
| AutoMod warnings | Redis (`automod:warns:*`) | 24h | Warning count |
| `AntiRaidService` | Redis (`antiraid:*`) | 5-60m | Join tracking, raid mode, flagged accounts |
| `LockdownService` | Redis (`lockdown:*`) | 24h | Channel lock state |
| `SnipeService` | Redis (`snipe:*`) | 12h | Deleted message cache |

### Voice Events

| Component | State Location | TTL | Notes |
|-----------|---------------|-----|-------|
| `VoiceStateUpdate` disconnect timers | Redis (`voice:disconnect:*`) | 40s | Empty channel auto-disconnect |

### Rate Limiting & Cooldowns

| Component | State Location | TTL | Notes |
|-----------|---------------|-----|-------|
| Command cooldowns | Redis (`ratelimit:cooldown:*`) | Command-specific | User cooldowns |
| Rate limits | Redis (`ratelimit:*`) | Window-based | Request counts |
| Distributed rate limiter | Redis | Sliding window | Multi-shard safe |

### API & Caching

| Component | State Location | TTL | Notes |
|-----------|---------------|-----|-------|
| API responses | Redis (`api:*`) | 5m | External API cache |
| Translation cache | Redis (`api:translate:*`) | 1h | Pixiv translations |
| Guild settings | Redis (`guild:*`) | 5m | Bot config per guild |

### Fun/Games

| Component | State Location | TTL | Notes |
|-----------|---------------|-----|-------|
| Battle histories | Redis (`temp:battle:history:*`) | 1m | Death battle results |

---

## ⚠️ Intentionally Per-Shard Components

These components maintain state per-shard by design. This is correct behavior:

| Component | Reason | Safe? |
|-----------|--------|-------|
| `CommandRegistry` | Commands are identical on all shards | ✅ |
| `EventRegistry` | Event handlers are identical on all shards | ✅ |
| `Client` instance | Each shard needs its own Discord client | ✅ |
| `Container` (DI) | Services are instantiated per-shard | ✅ |
| `Logger` | Local logging is fine, metrics aggregate externally | ✅ |
| Local timers | Execute callbacks for Redis-coordinated state | ✅ |

---

## 🔶 Edge Cases & Considerations

### 1. Music Playback Coordination

**Scenario:** User in voice channel handled by Shard 1, but commands arrive on Shard 0.

**Solution:** 
- Queue state is in Redis (shared)
- Lavalink manages actual playback (external)
- Shard that handles the guild processes commands

```typescript
// Guild ID determines shard
const shardId = (BigInt(guildId) >> 22n) % BigInt(totalShards);
```

### 2. Inactivity Timer Coordination

**Scenario:** Bot joins VC on Shard 1, Shard 1 restarts, Shard 2 doesn't know about the timer.

**Solution:** 
- Deadlines stored in Redis with TTL
- Global checker polls Redis every 10 seconds
- Any shard can process expired deadlines

```typescript
// VoiceConnectionService polls Redis
const expiredGuilds = await cacheService.checkInactivityDeadlines();
for (const guildId of expiredGuilds) {
    // Only process if this shard handles the guild
    if (client.guilds.cache.has(guildId)) {
        await handleInactivity(guildId);
    }
}
```

### 3. Write Queue Recovery

**Scenario:** Shard crashes with pending database writes.

**Solution:**
- Write queue persisted to Redis (`graceful:writequeue:pending`)
- On startup, any shard can recover and process
- Deduplication by timestamp prevents double-writes

```typescript
// On boot
await gracefulDegradation.recoverWriteQueue();
```

### 4. Rate Limit Synchronization

**Scenario:** User sends commands rapidly across different shards.

**Solution:**
- All rate limits use Redis atomic operations
- `INCR` + `EXPIRE` ensure consistency
- Sliding window algorithm in Redis

```typescript
// Atomic check in Redis
const count = await redis.multi()
    .incr(key)
    .expire(key, windowSeconds)
    .exec();
```

---

## 🚫 Known Per-Shard State (Acceptable)

These use local `Map()` but are acceptable because:

| Component | Location | Reason OK |
|-----------|----------|-----------|
| `paginationState` | `ButtonHandler` | UI state, short-lived, user-specific |
| Interaction collectors | Discord.js | Bound to specific message/shard |

---

## 🔍 How to Verify Shard Safety

### Quick Checklist

1. **Does it use `new Map()` for runtime state?**
   - ❌ NOT SAFE (unless intentionally per-shard)
   - ✅ Convert to CacheService

2. **Does it use `CacheService` or direct Redis?**
   - ✅ SAFE - Redis is shared across shards

3. **Does it use `setInterval`/`setTimeout` for coordination?**
   - ⚠️ CAUTION - Timer should read state from Redis
   - Local timers are OK if they execute Redis-coordinated logic

4. **Does it store user/guild data in a class property?**
   - ❌ NOT SAFE - Move to Redis
   - ✅ OK if it's configuration (same on all shards)

### Code Search Patterns

```bash
# Find potential issues
grep -r "new Map()" src/ --include="*.ts" --include="*.js"
grep -r "private.*Map<" src/ --include="*.ts"
grep -r "setInterval" src/ --include="*.ts" --include="*.js"

# Verify Redis usage
grep -r "cacheService\." src/ --include="*.ts"
grep -r "redis\." src/ --include="*.ts"
```

---

## 📋 Migration Checklist for New Features

When adding new features, ensure shard safety:

- [ ] Runtime state stored in Redis via `CacheService`
- [ ] No `new Map()` for cross-request state
- [ ] Timers coordinate via Redis, not local state
- [ ] Rate limits use `CacheService.checkRateLimit()`
- [ ] Cooldowns use `CacheService.checkAndSetCooldown()`
- [ ] Consider: "What happens if this shard restarts?"

---

## 🧪 Testing Shard Safety

### Manual Test

1. Start bot with 2+ shards
2. Perform action on Guild A (Shard 0)
3. Restart Shard 0
4. Verify state persists when Shard 0 comes back

### Automated Test

```typescript
// tests/integration/shard-safety.test.ts
it('should persist queue state across shard restart', async () => {
    // Add track to queue
    await queueService.addTrack(guildId, track);
    
    // Simulate shard restart (clear local state)
    musicCache.clearLocalState();
    
    // Queue should still exist in Redis
    const queue = await queueService.getTracks(guildId);
    expect(queue).toContainEqual(track);
});
```

---

## 📚 Related Documentation

- [ARCHITECTURE_ROADMAP.md](./ARCHITECTURE_ROADMAP.md) - Full architecture overview
- [MONITORING.md](./MONITORING.md) - Metrics and alerting
- [SHARDING.md](./SHARDING.md) - Discord sharding setup
- [ROADMAP_8.5.md](./ROADMAP_8.5.md) - Migration progress

---

## 📝 Changelog

| Date | Change |
|------|--------|
| 2026-02-04 | Initial documentation |
| 2026-02-04 | Phase 7 complete - all state shard-safe |
| 2026-02-04 | Phase 8 Week 3 - 177 unit tests |
| 2026-02-04 | Post-revalidation Phase A-D complete |
| 2026-02-04 | Added AntiRaidService Redis migration |
| 2026-02-04 | Added LockdownService, SnipeService to Redis |
| 2026-02-04 | Added VoiceStateUpdate disconnect timers to Redis |
| 2026-02-04 | Score upgraded to 9/10 |
