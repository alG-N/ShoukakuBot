# 🚀 alterGolden Architecture Roadmap

> **Mục tiêu:** Chuyển đổi từ hobby project thành production-grade system sẵn sàng cho 1000+ Discord servers

**Timeline:** 16 tuần  
**Tổng effort ước tính:** ~215 giờ dev  
**Ngày bắt đầu:** February 3, 2026  

---

## 📊 Tổng quan các Phase

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  PHASE 0 (Week 1-2)     │  PHASE 1 (Week 3-5)      │  PHASE 2 (Week 6-8)    │
│  ═══════════════════    │  ═══════════════════     │  ═══════════════════   │
│  Foundation             │  Remove Tech Debt        │  Split God Modules     │
│  • Sentry               │  • Factory Pattern       │  • Music Service       │
│  • Health Check         │  • Unified Cache         │  • Event System        │
│  • Redis Migration      │  • Error Standardization │  • Testing Foundation  │
├─────────────────────────────────────────────────────────────────────────────┤
│  PHASE 3 (Week 9-11)    │  PHASE 4 (Week 12-14)    │  PHASE 5 (Week 15-16)  │
│  ═══════════════════    │  ═══════════════════     │  ═══════════════════   │
│  Resilience             │  TypeScript Migration    │  Scale Preparation     │
│  • Circuit Breaker      │  • Core Modules          │  • Sharding            │
│  • Graceful Degradation │  • Service Types         │  • Monitoring          │
│  • DB Reliability       │  • Command Types         │  • Documentation       │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🔴 Critical Issues (Phải fix trước khi scale)

| Issue | Tại sao nguy hiểm | Phase |
|-------|-------------------|-------|
| Singleton Antipattern | Không test được, không scale được | Phase 1 |
| In-memory Rate Limits | Reset khi restart, không work với multi-instance | Phase 0 |
| No Error Tracking | Không biết production đang fail gì | Phase 0 |
| MusicService 1377 LOC | High risk khi modify, bug dễ xuất hiện | Phase 2 |
| No Circuit Breaker | Lavalink fail = tất cả music fail | Phase 3 |

---

## 📅 Chi tiết từng Phase

### Phase 0: Foundation (Week 1-2) 🏗️
**Goal:** Dừng chảy máu. Fix các vấn đề sẽ gây outage.

#### Week 1: Observability & Safety Net ✅ COMPLETE

| Task | Priority | Effort | File Changes | Status |
|------|----------|--------|--------------|--------|
| Thêm Sentry error tracking | P0 | 4h | `src/core/sentry.js` (new) | ✅ Done |
| Tạo `/health` endpoint | P0 | 2h | `src/core/health.js` (new) | ✅ Done |
| Structured logging (JSON) | P1 | 4h | `src/core/Logger.js` | ✅ Done |
| Tạo `.env.example` | P1 | 1h | `.env.example` (new) | ✅ Done |
| Move `clientId` to env | P1 | 30m | `src/config/bot.js` | ✅ Done |

**Deliverables:**
```
src/core/
├── sentry.js      # ✅ DONE - Sentry SDK integration
├── health.js      # ✅ DONE - Health check service  
└── Logger.js      # ✅ DONE - JSON structured logging with logRequest(), logCommand()
```

#### Week 2: Redis Migration (Critical State) ✅ COMPLETE

| Task | Priority | Effort | Current Location → New | Status |
|------|----------|--------|------------------------|--------|
| Migrate spam trackers | P0 | 6h | `AutoModService.js` Map → Redis | ✅ Done |
| Migrate duplicate trackers | P0 | 4h | `AutoModService.js` Map → Redis | ✅ Done |
| Migrate rate limits | P0 | 4h | `access.js` Map → Redis | ✅ Done |
| Migrate automod warns | P0 | 2h | `AutoModService.js` Map → Redis | ✅ Done |
| Health check cho Redis | P1 | 1h | `health.js` | ✅ Done |

**Deliverables:**
```
src/services/guild/RedisCache.js  # ✅ Added: trackSpamMessage, trackDuplicateMessage, 
                                  #    trackAutomodWarn, checkRateLimit methods
src/services/moderation/AutoModService.js  # ✅ Updated: checkSpam, checkDuplicates, 
                                           #    trackAutomodWarn now use Redis
src/middleware/access.js  # ✅ Added: DistributedRateLimiter class for multi-instance
```

**Before:**
```javascript
// AutoModService.js - IN MEMORY (bad)
const messageTracker = new Map();
const duplicateTracker = new Map();
```

**After:**
```javascript
// Redis với TTL tự động expire
const count = await redisCache.trackSpamMessage(guildId, userId, windowSeconds);
const { count } = await redisCache.trackDuplicateMessage(guildId, userId, content, windowSeconds);
```

---

### Phase 1: Remove Technical Debt (Week 3-5) 🧹
**Goal:** Làm codebase an toàn để modify.

#### Week 3: Factory Pattern Migration

| Task | Effort | Files Affected |
|------|--------|----------------|
| Tạo Container class | 4h | `src/container.js` (new) |
| Convert PostgresDatabase | 2h | `src/database/postgres.js` |
| Convert RedisCache | 2h | `src/services/guild/RedisCache.js` |
| Convert LavalinkService | 3h | `src/services/music/LavalinkService.js` |
| Convert CommandRegistry | 2h | `src/services/registry/CommandRegistry.js` |

**New Pattern:**
```javascript
// src/container.js
class Container {
    register(name, factory, options = { singleton: true }) { }
    resolve(name) { }
    reset() { } // For testing
}

// Usage
container.register('database', (c) => new PostgresDatabase(config));
container.register('musicService', (c) => new MusicService(
    c.resolve('lavalinkService'),
    c.resolve('musicCache')
));
```

#### Week 4: Unified Cache Layer

| Task | Effort | Description |
|------|--------|-------------|
| Design interface | 2h | Một interface cho tất cả cache |
| Merge implementations | 8h | 4 cache → 1 cache |
| Update consumers | 6h | Tất cả services dùng unified cache |
| Add metrics | 2h | hit/miss ratio tracking |

**Hiện tại có 4 cache khác nhau:**
1. `BaseCache` - LRU với TTL
2. `CacheManager` - Wrapper
3. `RedisCache` - Redis + fallback
4. Per-service Maps - Ad-hoc

**Sau khi merge:** 1 unified `CacheService`

#### Week 5: Error Handling Standardization

| Task | Effort | Description |
|------|--------|-------------|
| Define Result pattern | 2h | `Result.ok(data)` / `Result.err(code, msg)` |
| Update all services | 8h | Consistent return types |
| Add error codes enum | 2h | Typed error codes |
| Update command handlers | 4h | Handle new pattern |

**Before (inconsistent):**
```javascript
// ModerationService - returns object
return { success: false, error: 'Cannot kick...' };

// MusicService - throws
throw new Error('NO_PLAYER');
```

**After (consistent):**
```javascript
// Tất cả services
return Result.err('NOT_KICKABLE', 'Cannot kick this user');
return Result.ok({ userId: target.id });
```

---

### Phase 2: Split God Modules (Week 6-8) ✂️
**Goal:** MusicService từ 1377 LOC → 5 services nhỏ.

#### Week 6: Music Domain Extraction

**Current Structure:**
```
src/services/music/
├── MusicService.js    # 1377 lines - GOD MODULE 💀
└── LavalinkService.js
```

**Target Structure:**
```
src/services/music/
├── index.js                    # Facade (backward compat)
├── MusicFacade.js             # Orchestrates sub-services
├── queue/
│   ├── QueueService.js        # Queue CRUD (~200 LOC)
│   └── QueueRepository.js     # State persistence
├── playback/
│   ├── PlaybackService.js     # Play/pause/skip (~250 LOC)
│   └── PlaybackEventHandler.js
├── voice/
│   └── VoiceConnectionService.js (~150 LOC)
├── autoplay/
│   └── AutoPlayService.js     # Related track discovery (~200 LOC)
└── lavalink/
    └── LavalinkService.js     # External service wrapper
```

| Service | LOC Target | Responsibilities |
|---------|------------|------------------|
| QueueService | ~200 | add, remove, move, clear, get tracks |
| PlaybackService | ~250 | play, pause, skip, stop, seek |
| VoiceConnectionService | ~150 | connect, disconnect, cleanup |
| AutoPlayService | ~200 | find similar, recommendation |
| MusicFacade | ~100 | Orchestrate all above |

#### Week 7: Music Event System

| Task | Effort | Description |
|------|--------|-------------|
| Create MusicEventBus | 4h | Central event emitter |
| Migrate player events | 6h | From inline handlers to event bus |
| Extract AutoPlayService | 4h | Separate autoplay logic |
| Proper cleanup | 2h | Remove listeners on destroy |

**Before:**
```javascript
player.on('end', async (data) => {
    // 50 lines of inline logic
});
```

**After:**
```javascript
// PlaybackEventHandler.js
eventBus.on('track:end', async (data) => {
    await this.handleTrackEnd(data);
});
```

#### Week 8: Testing Foundation

| Task | Effort | Target Coverage |
|------|--------|-----------------|
| Jest + testcontainers setup | 6h | - |
| QueueService tests | 6h | 80% |
| PlaybackService tests | 6h | 80% |
| Integration tests | 6h | Critical paths |

**Test Structure:**
```
tests/
├── unit/
│   ├── services/
│   │   └── music/
│   │       ├── QueueService.test.js
│   │       └── PlaybackService.test.js
│   └── utils/
├── integration/
│   ├── database.test.js
│   └── redis.test.js
└── e2e/
    └── music-flow.test.js
```

---

### Phase 3: Resilience (Week 9-11) 🛡️
**Goal:** Survive external failures gracefully.

#### Week 9: Circuit Breaker Implementation

| Service | Failure Threshold | Timeout | Reset |
|---------|-------------------|---------|-------|
| Lavalink | 5 failures | 30s | 60s |
| External APIs | 3 failures | 10s | 30s |
| Database | 3 failures | 5s | 30s |

**Implementation:**
```javascript
const lavalinkBreaker = new CircuitBreaker({
    name: 'lavalink',
    failureThreshold: 5,
    timeout: 30000,
    resetTimeout: 60000,
    fallback: () => ({ error: 'Music temporarily unavailable' })
});

// Usage
const result = await lavalinkBreaker.execute(() => 
    lavalinkService.search(query)
);
```

#### Week 10: Graceful Degradation

| Scenario | Fallback Behavior |
|----------|-------------------|
| Redis down | Use in-memory cache (limited) |
| Lavalink down | Preserve queue, pause playback, notify users |
| Database down | Serve cached data, queue writes |
| External API down | Return cached results, show stale indicator |

#### Week 11: Database Reliability

| Task | Effort | Description |
|------|--------|-------------|
| Add Knex.js | 4h | Migration framework |
| Convert schema.sql | 4h | To migration files |
| Add retry logic | 3h | For transient failures |
| Read replica prep | 4h | For future scaling |

**Migration Structure:**
```
migrations/
├── 20260203_001_initial_schema.js
├── 20260203_002_add_automod_settings.js
└── 20260203_003_add_indexes.js
```

---

### Phase 4: TypeScript Migration (Week 12-14) 📘
**Goal:** Type safety cho core modules.

#### Migration Order (theo dependency):

```
Week 12:                    Week 13:                    Week 14:
┌─────────────────┐        ┌─────────────────┐        ┌─────────────────┐
│ 1. errors/      │───────▶│ 4. Container    │───────▶│ 7. BaseCommand  │
│ 2. constants.ts │        │ 5. Database     │        │ 8. Top 5 cmds   │
│ 3. Logger.ts    │        │ 6. Cache        │        │ 9. Handlers     │
└─────────────────┘        └─────────────────┘        └─────────────────┘
```

**tsconfig.json:**
```json
{
    "compilerOptions": {
        "target": "ES2022",
        "module": "commonjs",
        "allowJs": true,
        "strict": true,
        "outDir": "./dist",
        "esModuleInterop": true
    },
    "include": ["src/**/*"],
    "exclude": ["node_modules", "tests"]
}
```

---

### Phase 5: Scale Preparation (Week 15-16) 📈
**Goal:** Sẵn sàng cho 1000+ servers.

#### Week 15: Sharding Preparation

**Audit checklist:**
- [ ] `client.guilds.cache.get()` → Cross-shard safe
- [ ] `client.users.cache.get()` → Cross-shard safe  
- [ ] Global stats → Redis aggregation
- [ ] Voice state → Shard-aware

**ShardingManager:**
```javascript
// src/sharding.js
const { ShardingManager } = require('discord.js');

const manager = new ShardingManager('./src/index.js', {
    token: process.env.BOT_TOKEN,
    totalShards: 'auto',
    respawn: true
});

manager.on('shardCreate', shard => {
    console.log(`Launched shard ${shard.id}`);
});

manager.spawn();
```

#### Week 16: Monitoring & Documentation

**Prometheus Metrics:**
```javascript
// Metrics to expose
- command_execution_duration_seconds
- discord_gateway_latency_ms
- cache_hit_ratio
- circuit_breaker_state
- queue_size_per_guild
- active_voice_connections
```

**Grafana Dashboards:**
1. Overview Dashboard
2. Music Service Dashboard
3. Error Rate Dashboard
4. Resource Usage Dashboard

---

## ✅ Milestone Checkpoints

| Week | Milestone | Definition of Done |
|------|-----------|-------------------|
| 2 | Observability ✓ | Sentry nhận errors, `/health` returns 200 |
| 5 | Clean Architecture ✓ | No singleton, unified cache, Result pattern |
| 8 | Music Refactor ✓ | MusicService <400 LOC, 80% coverage |
| 11 | Resilience ✓ | Circuit breakers active, load test pass |
| 14 | Type Safety ✓ | Core modules TypeScript, no `any` |
| 16 | Scale Ready ✓ | Sharding works, metrics exposed |

---

## 💰 Resource Requirements

| Phase | Dev Hours | Infra Changes | Monthly Cost |
|-------|-----------|---------------|--------------|
| Phase 0 | 25h | Sentry account | +$26/mo |
| Phase 1 | 40h | None | $0 |
| Phase 2 | 40h | None | $0 |
| Phase 3 | 35h | None | $0 |
| Phase 4 | 40h | None | $0 |
| Phase 5 | 35h | Prometheus, Grafana | +$20/mo |
| **Total** | **215h** | | **~$50/mo** |

---

## ⚠️ Risk Mitigation

### High-Risk Changes

| Change | Risk | Mitigation Strategy |
|--------|------|---------------------|
| Singleton removal | Breaking imports | Facade pattern, gradual deprecation |
| Music refactor | Playback bugs | Feature flag, A/B test 10% guilds |
| Redis migration | Data loss | Shadow write, compare before cutover |
| TypeScript | Build failures | CI validates, `allowJs` enabled |

### Rollback Strategy

```
1. Feature flags cho mọi changes lớn
2. Database migrations luôn reversible
3. Keep old code 2 weeks sau migration
4. Canary deployment: 10% guilds trước
```

---

## 🎯 Immediate Next Steps (Tuần này)

- [x] Tạo Sentry project → `src/core/sentry.js`
- [x] Implement `/health` endpoint → `src/core/health.js`
- [x] Tạo `.env.example`
- [x] Move `clientId` to env → `src/config/bot.js`
- [ ] Setup task board (Jira/Linear/GitHub Projects)
- [ ] Schedule weekly architecture review
- [ ] Migrate spam trackers to Redis (Week 2)
- [ ] Migrate rate limits to Redis (Week 2)

---

## 📚 Future Phases (Post Week 16)

### Phase 6: Full TypeScript (Week 17-24)
- Convert tất cả JS → TS
- Enable strict mode
- No `any` types

### Phase 7: Infrastructure (Week 25-32)
- Kubernetes manifests
- Horizontal Pod Autoscaler
- Managed Postgres (RDS)
- Redis Cluster

### Phase 8: Multi-Language (Khi cần)
- gRPC service boundaries
- Video service → Go
- AutoMod → Rust
- Keep Node.js cho Discord orchestration

---

## 📝 Notes

_Ghi chú thêm ở đây..._

---

**Last Updated:** February 3, 2026  
**Author:** Architecture Review  
**Status:** Draft - Pending Approval
