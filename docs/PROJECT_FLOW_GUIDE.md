# Project Flow Guide

Tai lieu nay mo ta toan bo luong chay cua ShoukakuBot: startup, command handling, music pipeline, data layer, observability, va bo cong cu van hanh.

## 1. Tong Quan Kien Truc

Project duoc chia theo layer:

- `src/index.ts`: entrypoint, startup sequence, health, command deploy, login Discord.
- `src/bootstrap/services.ts`: DI registration cho toan bo singleton service.
- `src/core/*`: logger, metrics, health, error handling, graceful shutdown/degradation.
- `src/commands/*`: slash command layer (presentation).
- `src/events/*`: Discord event listeners.
- `src/services/*`: business logic (music, api, moderation, video, guild).
- `src/cache/*`: cache abstraction (Redis + fallback memory).
- `src/database/*`: PostgreSQL access + init lifecycle.
- `tests/*`: unit/integration test.

Model thuc thi la: **Discord interaction -> Command -> Service -> Cache/DB/External API -> Response**.

## 2. Startup Flow (Main Runtime)

Luong startup chinh trong `src/index.ts`:

1. Load env va validate (`validateOrExit`).
2. Khoi tao `ShoukakuBot` (Discord client + REST client).
3. `start()` chay theo thu tu:
   - Init Sentry.
   - Start health server (`/health`).
   - Init PostgreSQL (`initializeDatabase`).
   - Register all services vao DI container (`registerServices`).
   - Boot Redis/cache + resolve registry service.
   - Load commands, load events, bind interaction listener.
   - Init error/shutdown handlers.
   - Pre-initialize Lavalink (neu music enabled).
   - Login Discord.
4. Khi `ClientReady`:
   - Bind logger voi client.
   - Set shard metadata cho gracefulDegradation + Sentry.
   - Register health checks.
   - Init `SnipeService`, `ShardBridge`.
   - Auto deploy commands (neu bat).
   - Gui startup summary (duoc dedup qua cache key theo shard).

Diem quan trong:

- Entry-point guard tranh bot auto-run khi file duoc import boi test/tooling.
- Redis duoc su dung de dedup startup messages va shard-safe state.

## 3. Dependency Injection Flow

`src/bootstrap/services.ts` la map singleton trung tam:

- Core: database, redis, cache, command/event registry.
- API services: anilist, reddit, pixiv, nhentai, rule34, steam, wikipedia, ...
- Music services: lavalink, queue, playback, autoplay, spotify, event bus.
- Video services: cobalt, yt-dlp API integration, processing.
- Guild/moderation/fun services.
- Repositories co lifecycle.

Muc tieu: container resolve ra dung instance dang duoc import truc tiep, tranh dual-instance bug.

## 4. Command va Interaction Flow

Trong `setupInteractionListener` (`src/index.ts`):

1. Nhan `InteractionCreate`.
2. Route theo interaction type:
   - chat input command
   - autocomplete
   - button
   - modal submit
   - string select menu
3. Tim command handler tu `commandRegistry`.
4. Goi execute/autocomplete/handler tuong ung.
5. Bat lifecycle errors cua Discord interaction (expired/handled).

Luot xu ly nay giu command layer gon, con business logic day xuong service layer.

## 5. Music System Flow

Music architecture xoay quanh cac thanh phan sau:

- `MusicFacade`: entry service cho command music.
- `QueueService`: queue state operations.
- `PlaybackService`: play/pause/skip/seek/stop voi Lavalink player.
- `AutoPlayService`: de xuat bai tiep theo dua tren profile + heuristics.
- `VoiceConnectionService`: voice channel/session control.
- `MusicEventBus` + `PlaybackEventHandler`: event-driven transitions.

### 5.1 Play Flow

1. Command `/music play` resolve track.
2. Track duoc dua vao queue/cache.
3. `MusicFacade.playTrack` validate player + encoded track.
4. Player goi Lavalink `playTrack`.
5. Metrics update va now-playing lifecycle trigger.

### 5.2 End/Next Flow

1. Track end event vao playback handler.
2. `playNext` trong facade/playback service quyet dinh theo loop mode:
   - `track`: replay current.
   - `queue`: push current ve cuoi queue.
   - `off`: lay next track.
3. Neu queue het: trigger queue-end flow (co the autoplay neu enabled).

### 5.3 Autoplay Flow

`AutoPlayService.findSimilarTrack`:

1. Rate-limit theo guild.
2. Build listening profile tu current + history (genre/language/mood).
3. Build weighted search strategies:
   - artist relation
   - genre/context
   - mood/language
   - discovery
4. Query Lavalink search (`ytmsearch` preferred).
5. Score va pick track voi diversity bias (giam repeat artist).
6. Neu that bai: fallback query set.

## 6. Data Flow: Cache + Database

### 6.1 Redis/Cache

- Redis la shared state de shard-safe.
- `CacheService` cung cap layer thong nhat (Redis neu co, memory neu khong).
- Music queue/user/vote cache duoc tach module de truy cap nhanh.

### 6.2 PostgreSQL

- Khoi tao schema qua `docker/init/*.sql`.
- Runtime DB truy cap qua `src/database/postgres.ts` + repositories/services.
- Dung cho command analytics, moderation records, va du lieu can persistence.

## 7. External Integrations

- Discord API qua `discord.js`.
- Lavalink nodes (audio streaming).
- Spotify (metadata/link resolution va inputs cho autoplay logic).
- Cobalt + yt-dlp API (video download pipeline).
- Nhieu API service khac: Reddit, Pixiv, Steam, Wikipedia, Rule34, ...

## 8. Observability va Reliability

- Logging: `core/Logger.ts`.
- Metrics: `core/metrics.ts` + Prometheus stack trong `monitoring/`.
- Health checks: `core/health.ts` + `/health` endpoint.
- Error tracking: Sentry (`core/sentry.ts`).
- Fault tolerance: circuit breaker + graceful degradation.
- Graceful shutdown: `core/shutdown.ts`.

## 9. Tooling Stack

### Runtime

- Node.js 20+
- TypeScript 5
- Discord.js v14
- Shoukaku + Lavalink client
- PostgreSQL + Knex
- Redis (ioredis)

### Dev/Test

- `npm run build`
- `npm run dev`
- `npm run test` (Jest + ts-jest)
- `npm run lint`
- `npm run types:guardrails`
- `npm run types:check`

### Infra

- Docker Compose (`docker-compose.yml` + compose files split theo service)
- Prometheus + Grafana + Alertmanager (folder `monitoring/`)

## 10. Comment Policy De Xuat

De codebase de maintain, nen ap dung policy comment nhu sau:

- Giu comment giai thich **why** (ly do, tradeoff, edge-case).
- Xoa comment chi mo ta **what** ma code da ro rang.
- Han che banner/separator comments.
- Uu tien doc ten ham/bien ro nghia thay vi doc comment.
- Neu business rule nhay cam, dat comment ngan ngay tren logic do.

## 11. Suggested Rollout Toan Repo

Neu muon don comment cho toan bo project theo mot chuan nhat quan:

1. Chay theo module: `core -> music -> api -> moderation -> video -> commands`.
2. Moi module: cleanup comment + run test unit lien quan.
3. Bat buoc pass `npm run build` va `npm run test` sau moi phase.
4. Review PR theo rule: "comment phai tra loi cau hoi why".

Tai lieu nay dong vai tro technical map de onboard nhanh va review kien truc de dang hon.
