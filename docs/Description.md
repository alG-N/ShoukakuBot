# alterGoldenBot - AI Project Description

## 1) Dự án này là gì?

`alterGolden` là Discord bot backend viết bằng TypeScript, tập trung vào:
- Tiện ích server (general/admin/moderation)
- Music playback (Lavalink + queue/voice service)
- Video download/processing (Cobalt + yt-dlp fallback + ffmpeg)
- API commands (Google/Wikipedia/Anime/Reddit/Pixiv/NHentai/Steam/...)
- Vận hành production cho nhiều guild, có shard-safe và monitoring.

Mục tiêu thiết kế là chạy ổn định dài hạn cho quy mô lớn (1000+ servers), ưu tiên reliability hơn “code ngắn”.

---

## 2) Stack kỹ thuật chính

- Runtime: Node.js 20+, TypeScript, Discord.js v14
- Database: PostgreSQL (Knex)
- Cache/distributed state: Redis (fallback memory khi Redis lỗi)
- Music node: Lavalink
- Video backend: Cobalt API + yt-dlp API + ffmpeg
- Observability: Prometheus + Grafana + health endpoint + custom metrics
- Error tracking: Sentry (optional qua env)
- Test: Jest (unit + integration)

---

## 3) Kiến trúc tổng quan (theo codebase hiện tại)

### Entry & lifecycle
- `src/index.ts`: entrypoint chính của bot.
- `src/sharding.ts`: sharding manager cho multi-process scale.

Startup flow (rút gọn):
1. Load `.env` + validate env (`validateOrExit`)
2. Init Sentry / health server
3. Init PostgreSQL
4. Register service vào DI container (`src/bootstrap/services.ts`)
5. Boot Redis + bind vào `CacheService`
6. Load commands + events
7. Setup interaction listener
8. Init shutdown/error handlers
9. Init Lavalink (nếu bật)
10. Login Discord + deploy slash commands (nếu `AUTO_DEPLOY=true`)

### Layer responsibilities
- `src/commands/`: Presentation layer cho slash commands.
	- Base abstraction nằm ở `BaseCommand` (cooldown, validation, permission, error handling).
- `src/handlers/`: xử lý business/presentation helper theo feature (embed builders, interaction sub-flow).
- `src/services/`: nghiệp vụ chính theo domain (music/video/api/moderation/guild/registry).
- `src/repositories/`: truy cập dữ liệu/cache cụ thể theo domain.
- `src/cache/`: Unified cache service + music cache facade.
- `src/core/`: client, logger, circuit breaker, graceful degradation, health, metrics, shutdown, sentry.
- `src/middleware/`: access checks, permissions, rate limiter, URL validator, voice checks.
- `src/config/`: config runtime + feature flags + env validation.

---

## 4) Đặc điểm quan trọng để AI hiểu đúng

### 4.1 Cache architecture (rất quan trọng)
- `CacheService` là lớp cache trung tâm cho toàn dự án.
- Namespace-based TTL + metrics hit/miss theo namespace.
- Redis là backend chính; memory là fallback khi degrade.
- Có tích hợp graceful degradation và thống kê `effectiveHitRate`.

### 4.2 Shard-safe design
- State chia sẻ giữa shard ưu tiên đi qua Redis/CacheService.
- Có `ShardBridge` cho cross-shard communication.
- Nhiều thành phần moderation/music đã hướng đến shard-safe thay vì state in-memory cục bộ.

### 4.3 Reliability patterns
- Circuit Breaker cho external/API instability.
- Graceful degradation khi dependency lỗi.
- Health checks + `/metrics` style monitoring để quan sát runtime.
- Centralized logger + error handling wrappers.

### 4.4 Mixed module interop
- Codebase dùng ESM (`.js` import path trong TS) nhưng có nhiều chỗ `require(...)` + `getDefault(...)` để xử lý CJS/ESM interop.
- Khi refactor import, cần chú ý pattern này để tránh runtime break.

---

## 5) Command domains hiện có

- `general`: ping/help/avatar/serverinfo/afk/invite/report/roleinfo
- `admin`: ban/kick/mute/warn/automod/raid/lockdown/...
- `music`: play/queue/control/favorites/history/settings (qua music services)
- `video`: download video từ social platforms
- `api`: anime/fandom/google/nhentai/pixiv/reddit/rule34/steam/wikipedia
- `fun`: deathbattle/say
- `owner`: botcheck và owner-only tools

Mỗi command thường đi theo flow:
`Command` → `Handler` (nếu có) → `Service` → `Repository/Cache`.

---

## 6) Hạ tầng Docker trong repo

- `docker-compose.yml`: bot + postgres + redis (core stack)
- `docker-compose.lavalink.yml`: cụm Lavalink nodes
- `docker-compose.cobalt.yml`: cụm Cobalt instances
- `docker-compose.monitoring.yml`: Prometheus + Grafana
- Scripts hỗ trợ: `start.ps1`, `stop.ps1`, `rebuild.ps1`

Repo này được thiết kế theo hướng có thể chạy local dev hoặc production-like stack bằng Docker Compose.

---

## 7) Dữ liệu & test

- SQL init nằm ở `docker/init/*.sql`.
- Unit tests trong `tests/unit`.
- Integration tests trong `tests/integration` (cần Postgres/Redis test env).
- Test setup mặc định qua `tests/setup.ts`.

---

## 8) Hướng dẫn nhanh cho AI khi sửa code

1. Ưu tiên sửa theo đúng layer (đừng nhảy thẳng command ↔ database nếu đã có service/repository).
2. Tái sử dụng `CacheService`, tránh tạo cache cục bộ mới trừ khi có lý do rõ ràng.
3. Giữ shard-safe: state quan trọng nên ở Redis/DB, không phụ thuộc memory per-process.
4. Khi thêm command mới:
	 - Extend `BaseCommand`
	 - Register/export đúng tại index file liên quan
	 - Bổ sung handler/service theo pattern hiện hữu
5. Khi gọi API ngoài: cân nhắc timeout/retry/circuit-breaker + logging rõ ràng.
6. Giữ style hiện có (ESM path `.js`, type safety, logger thay cho console nếu module đó đã dùng logger).

---

## 9) Tóm tắt 1 câu cho AI

Đây là một Discord bot backend TypeScript quy mô production, kiến trúc nhiều lớp, ưu tiên shard-safe + reliability, với trục chính là command-driven features (music/video/api/moderation) dựa trên PostgreSQL + Redis + observability đầy đủ.
