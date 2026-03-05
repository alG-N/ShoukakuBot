# 🤖 Shoukaku Discord Bot

<div align="center">

![Discord.js](https://img.shields.io/badge/discord.js-v14.19-blue?logo=discord&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-20+-green?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue?logo=typescript&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-Shard_Safe-DC382D?logo=redis&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-yellow)

**A feature-rich, shard-safe Discord bot with music streaming, video downloads, API integrations, and advanced moderation tools.**

</div>

---

## ✨ Features Overview

| Category | Features |
|----------|----------|
| 🎵 **Music** | Lavalink-powered streaming, queue management, autoplay, lyrics, favorites |
| 📹 **Video** | Download videos via `/download` (Cobalt API + yt-dlp fallback) |
| 🔌 **APIs** | Anime, Media embed-fix, NHentai, Pixiv, Reddit, Rule34, Steam, Wikipedia |
| 🛡️ **Moderation** | Ban, kick, mute, warn, automod, lockdown, anti-raid, snipe |
| ⚙️ **Settings** | Per-server configuration, NSFW controls |
| 🎮 **Fun** | Death Battle (JJK, Naruto, One Piece, Demon Slayer skillsets) |
| 📊 **Analytics** | Command usage tracking via PostgreSQL |
| 🔀 **Scalable** | Fully shard-safe with Redis-backed state |

---

## 🏗️ Architecture

```
shoukaku-backend/
├── 📁 src/
│   ├── 📁 commands/           # Slash commands (organized by category)
│   │   ├── admin/             # automod, ban, case, clearwarns, delete,
│   │   │                      #   delwarn, kick, lockdown, mute, raid, setting,
│   │   │                      #   slowmode, snipe, warn, warnings
│   │   ├── api/               # anime, media, nhentai, pixiv,
│   │   │                      # reddit, rule34, steam, wikipedia
│   │   ├── fun/               # deathbattle, say
│   │   ├── general/           # afk, avatar, help, invite, ping,
│   │   │                      #   report, roleinfo, serverinfo
│   │   ├── music/             # /music (multi-subcommand)
│   │   ├── video/             # /download
│   │   └── owner/             # botcheck
│   │
│   ├── 📁 config/             # Configuration files
│   │   ├── bot.ts             # Bot settings
│   │   ├── database.ts        # Database config
│   │   ├── services.ts        # External service configs
│   │   ├── deathbattle/       # Skillsets: JJK, Naruto, One Piece, Demon Slayer
│   │   └── features/          # Feature-specific configs
│   │
│   ├── 📁 core/               # Core modules
│   │   ├── Client.ts          # Extended Discord Client
│   │   ├── Logger.ts          # Structured logging
│   │   ├── CircuitBreaker.ts  # Fault tolerance
│   │   ├── GracefulDegradation.ts # Service degradation with durable queue
│   │   ├── Result.ts          # Functional error handling
│   │   ├── errorHandler.ts    # Global error handling
│   │   ├── shutdown.ts        # Graceful shutdown
│   │   └── metrics.ts         # Prometheus metrics
│   │
│   ├── 📁 services/           # Business logic layer
│   │   ├── api/               # API service implementations
│   │   ├── music/             # MusicFacade, LavalinkService, VoiceConnectionService
│   │   ├── video/             # VideoDownloadService, CobaltService, YtDlpService
│   │   ├── moderation/        # AutoMod, LockdownService, SnipeService, AntiRaid
│   │   ├── guild/             # GuildSettings, RedisCache, ShardBridge
│   │   └── registry/          # Command/event registration
│   │
│   ├── 📁 cache/              # Unified caching (shard-safe)
│   │   ├── CacheService.ts    # Redis + memory fallback
│   │   └── index.ts           # Cache exports
│   │
│   ├── 📁 database/           # Database layer
│   │   ├── postgres.ts        # PostgreSQL with write queue
│   │   └── index.ts           # Database exports
│   │
│   ├── 📁 events/             # Discord event listeners
│   │   ├── messageCreate.ts   # Message handling + automod
│   │   ├── voiceStateUpdate.ts # Voice channel events
│   │   └── ready.ts           # Bot ready event
│   │
│   ├── 📁 middleware/         # Request middleware
│   │   ├── access.ts          # Permission & cooldown checks
│   │   ├── checks.ts          # Validation checks
│   │   └── voiceChannelCheck.ts # Voice channel validation
│   │
│   ├── 📁 utils/              # Utility functions
│   │   ├── common/            # General utilities, pagination, cooldown
│   │   ├── music/             # Music-specific utilities
│   │   └── deathbattle/       # Game utilities
│   │
│   ├── 📁 bootstrap/          # Application startup
│   │   └── services.ts        # DI container registration
│   │
│   └── container.ts           # Dependency Injection container
│
├── 📁 tests/
│   ├── unit/                  # Unit tests
│   └── integration/           # Integration test framework
│
├── 📁 docker/
│   └── init/                  # PostgreSQL init scripts
│
├── 📁 docs/
│   ├── SHARD_SAFETY.md
│   ├── SHARDING.md
│   ├── MONITORING.md
│   └── TOS.md
│
├── 🐳 docker-compose.yml      # Docker services config
├── 🐳 Dockerfile              # Bot container definition
└── 📦 package.json
```

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** 20+ 
- **Docker** & Docker Compose
- **Discord Bot Token** ([Discord Developer Portal](https://discord.com/developers/applications))

### Installation

```bash
# 1. Clone repository
git clone <repository-url>
cd shoukaku-backend

# 2. Install dependencies
npm install

# 3. Configure environment
# Create `.env` manually in project root and add your credentials

# 4. Start Docker services (PostgreSQL, Lavalink)
npm run docker:up

# 5. Build and run the bot
npm run build
npm start
```

### Development Mode

```bash
npm run dev  # Compile TypeScript and run dist build
```

### Type Guardrails

```bash
npm run types:guardrails  # Report duplicate type/interface names + any stubs
npm run types:check       # CI-safe check (fails on `type X = any` stubs)
```

Type placement rules:
- Keep a type local when it is only used in one file.
- Move a type to `src/types/` when it is used across 2+ modules.
- Never add `type X = any`; define a real contract or import an existing type.
- Prefer `import type { ... }` for type-only dependencies.

Release checklist (type safety):
- Run `npm run types:guardrails` and review duplicates.
- Refresh the type scan artifact in `docs/` when substantial type migrations are included.
- Run `npm run types:check` and `npm run build` before release.

---

## ⚙️ Configuration

### Environment Variables

```env
# ═══════════════════════════════════════════
# Discord Configuration
# ═══════════════════════════════════════════
BOT_TOKEN=your_bot_token_here
CLIENT_ID=your_client_id
OWNER_ID=your_discord_user_id

# ═══════════════════════════════════════════
# Database (PostgreSQL)
# ═══════════════════════════════════════════
DB_HOST=localhost
DB_PORT=5432
DB_USER=shoukaku
DB_PASSWORD=shoukaku_secret
DB_NAME=shoukaku_db

# ═══════════════════════════════════════════
# Lavalink (Music)
# ═══════════════════════════════════════════
LAVALINK_HOST=localhost
LAVALINK_PORT=2333
LAVALINK_PASSWORD=youshallnotpass

# ═══════════════════════════════════════════
# External APIs (Optional)
# ═══════════════════════════════════════════
PIXIV_REFRESH_TOKEN=your_pixiv_token
REDDIT_CLIENT_ID=your_reddit_client_id
REDDIT_CLIENT_SECRET=your_reddit_secret
STEAM_API_KEY=your_steam_api_key
COBALT_API_URL=https://your-cobalt-instance.com
```

---

## 🐳 Docker Commands

| Command | Description |
|---------|-------------|
| `npm run docker:up` | Start all services (PostgreSQL, Lavalink) |
| `npm run docker:down` | Stop all services |
| `npm run docker:logs` | View service logs |
| `npm run docker:build` | Rebuild containers |
| `npm run docker:restart` | Restart all services |

---

## 📋 Command Reference

### 🛡️ Admin Commands

| Command | Description | Permission |
|---------|-------------|------------|
| `/automod` | Configure automatic moderation | Administrator |
| `/ban` | Ban management (add/remove/list) | Ban Members |
| `/case` | View moderation case details | Moderate Members |
| `/clearwarns` | Clear warnings for a user | Moderate Members |
| `/delete` | Bulk delete messages with filters | Manage Messages |
| `/delwarn` | Delete a warning case | Moderate Members |
| `/kick` | Kick a user | Kick Members |
| `/lockdown` | Channel/server lockdown controls | Manage Channels |
| `/mute` | Timeout controls (add/remove) | Moderate Members |
| `/raid` | Anti-raid controls | Administrator |
| `/setting` | Guild configuration settings | Administrator |
| `/slowmode` | Slowmode controls | Manage Channels |
| `/snipe` | View recently deleted messages | Manage Messages |
| `/warn` | Issue warnings and warning settings | Moderate Members |
| `/warnings` | List warnings | Moderate Members |

### 🎵 Music Commands

| Command | Description |
|---------|-------------|
| `/music play` | Play a song or playlist |
| `/music stop` | Stop playback and clear queue |
| `/music skip` | Skip current track |
| `/music pause` | Pause/resume playback |
| `/music queue` | View queue (paged) |
| `/music nowplaying` | Show current track |
| `/music volume` | Set volume |
| `/music loop` | Set loop mode |
| `/music shuffle` | Toggle shuffle |
| `/music remove` | Remove track from queue |
| `/music move` | Move track position in queue |
| `/music clear` | Clear queue (keep current track) |
| `/music seek` | Seek to position |
| `/music lyrics` | Fetch lyrics |
| `/music history` | View recent tracks |
| `/music autoplay` | Toggle autoplay |
| `/music grab` | Send current track info to DM |

### 🔌 API Commands

| Command | Description |
|---------|-------------|
| `/anime` | AniList/MyAnimeList search and lookup |
| `/media` | Fix social-media embeds and preview media URLs |
| `/nhentai` | NHentai search/browse commands (NSFW) |
| `/pixiv` | Pixiv artwork search |
| `/reddit` | Browse subreddit posts and trending feeds |
| `/rule34` | Rule34 search commands (NSFW) |
| `/steam` | Steam sale/game/free/featured lookups |
| `/wikipedia` | Wikipedia search/article/random/today |

Note: command coverage can evolve between releases. Use `src/commands/` as the source of truth.

### 📹 Video Commands

| Command | Description |
|---------|-------------|
| `/download <url>` | Download video/media (YouTube, TikTok, Twitter/X, Instagram, Reddit, etc.) |

Supported platforms: YouTube, TikTok, Twitter/X, Instagram, Reddit, Twitch clips, and more via Cobalt API + yt-dlp fallback.

### 🎮 Fun Commands

| Command | Description |
|---------|-------------|
| `/deathbattle` | Simulate anime-style battles with selectable skillsets |
| `/say` | Send message/embed output via bot |

**Death Battle Skillsets:**
- **Jujutsu Kaisen** - Cursed techniques, Domain Expansion
- **Naruto** - Jutsu, Sharingan, Sage Mode
- **One Piece** - Devil Fruits, Haki
- **Demon Slayer** - Breathing styles, Demon abilities

### 📊 General Commands

| Command | Description |
|---------|-------------|
| `/afk` | Set AFK status |
| `/avatar` | Get user avatar |
| `/help` | Show interactive help menu |
| `/invite` | Bot invite link |
| `/ping` | Check bot/API latency |
| `/report` | Open report flow for issue submissions |
| `/roleinfo` | View role information |
| `/serverinfo` | View server information |

### 👑 Owner Commands

| Command | Description |
|---------|-------------|
| `/botcheck` | Bot status, diagnostics, and shard info |

---

## 🎵 Music System Details

### Supported Sources

- ✅ YouTube (search & direct links)
- ✅ YouTube Music
- ✅ Spotify (via Lavalink plugin)
- ✅ SoundCloud
- ✅ Bandcamp
- ✅ Vimeo
- ✅ Twitch streams
- ✅ HTTP streams

### Queue Management

- **Loop Modes:** Off, Track (repeat one), Queue (repeat all)
- **Shuffle:** Randomize queue order
- **Autoplay:** Auto-find similar tracks when queue ends
- **History:** Track recently played songs
- **Favorites:** Save and load favorite tracks

### Lyrics Integration

Uses multiple APIs for best coverage:
1. **LRCLIB** - Modern songs, synced lyrics
2. **lyrics.ovh** - Fallback source

---

## 🗄️ Database Schema

Database schema is managed by SQL bootstrap files in `docker/init/` and runtime DB code in `src/database/`.

Primary schema sources:
- `docker/init/01-schema.sql`
- `docker/init/02-optimizations.sql`
- `docker/init/03-moderation.sql`
- `docker/init/04-automod-migration.sql`
- `docker/init/05-user-music.sql`

---

## 🔧 Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| Bot not responding | Check `BOT_TOKEN` in `.env` |
| Music not playing | Verify Lavalink is running: `docker-compose logs lavalink` |
| Database errors | Ensure PostgreSQL is running: `docker-compose ps` |
| Commands not showing | Re-invite bot with `applications.commands` scope |

### Logs

```bash
# Bot logs
npm run dev

# Docker service logs
npm run docker:logs

# Specific service
docker-compose logs -f lavalink
docker-compose logs -f postgres
```

---

## 📦 Dependencies

### Core
- `discord.js` ^14.19 - Discord API wrapper
- `shoukaku` ^4.1 - Lavalink client
- `pg` ^8.12 - PostgreSQL client

### APIs
- `axios` ^1.9 - HTTP client
- `graphql-request` - GraphQL client (AniList)
- `ioredis` ^5.9 - Redis client (shard-safe state)

### Media
- `@discordjs/voice` - Voice connections
- `@discordjs/opus` - Opus encoding
- `ffmpeg-static` - FFmpeg binary

---

## 🧪 Testing

### Unit Tests

```bash
# Run all unit tests
npm test

# Run with coverage
npm test -- --coverage

# Run specific test file
npm test -- tests/unit/core/Container.test.ts
```

### Integration Tests

```bash
# Ensure Redis and Postgres are running
# Run integration tests
RUN_INTEGRATION_TESTS=1 npm test -- tests/integration/
```

Coverage varies by branch and commit. Run `npm test -- --coverage` for current numbers.

---

## 🔀 Multi-Shard Deployment

Shoukaku Bot is fully shard-safe. All runtime state is stored in Redis.

```bash
# Start with sharding (build first)
npm run build
node dist/sharding.js

# Or specify shard count
TOTAL_SHARDS=4 node dist/sharding.js
```

See [docs/SHARD_SAFETY.md](docs/SHARD_SAFETY.md) for details.

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| [cachehitrate.md](docs/cachehitrate.md) | Cache hit-rate notes and observations |
| [CODE_REVIEW.md](docs/CODE_REVIEW.md) | Consolidated review notes |
| [Description.md](docs/Description.md) | Project description notes |
| [SHARD_SAFETY.md](docs/SHARD_SAFETY.md) | Multi-shard deployment guide |
| [MONITORING.md](docs/MONITORING.md) | Prometheus/Grafana setup |
| [PotentialProblem.md](docs/PotentialProblem.md) | Potential issue tracking notes |
| [POTENTIAL_BUGS.md](docs/POTENTIAL_BUGS.md) | Known issues and future improvements |
| [SHARDING.md](docs/SHARDING.md) | Discord sharding config |
| [SYSTEM_REVIEW.md](docs/SYSTEM_REVIEW.md) | System review notes |
| [SYSTEM_REVIEW_REVAMPED.md](docs/SYSTEM_REVIEW_REVAMPED.md) | System review (revamped) |
| [SYSTEM_REVIEW_V3.md](docs/SYSTEM_REVIEW_V3.md) | System review v3 |
| [SYSTEM_REVIEW_V4.md](docs/SYSTEM_REVIEW_V4.md) | System review v4 |
| [TOS.md](docs/TOS.md) | Terms of Service for bot usage |
| [TYPES_ARCHITECTURE.md](docs/TYPES_ARCHITECTURE.md) | Type architecture and migration map |

---

## 🔒 Shard Safety

All runtime state is stored in Redis, making the bot fully shard-safe:

| Component | Storage | Status |
|-----------|---------|--------|
| Music queues | Redis | ✅ Shard-safe |
| Cooldowns | Redis | ✅ Shard-safe |
| Guild settings | Redis cache | ✅ Shard-safe |
| Snipe messages | Redis | ✅ Shard-safe |
| Lockdown state | Redis | ✅ Shard-safe |
| AutoMod tracking | Redis | ✅ Shard-safe |
| Rate limiting | Redis | ✅ Shard-safe |

---

## 📝 License

MIT License - See [LICENSE](LICENSE) for details.

---

## 👥 Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

---

<div align="center">

**Made with ❤️ by Shoukaku Bot Team**

[Report Bug](../../issues) · [Request Feature](../../issues)

</div>
