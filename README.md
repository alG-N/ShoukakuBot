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
| 📹 **Video** | Download videos via Cobalt API & yt-dlp |
| 🔌 **APIs** | Reddit, Pixiv, NHentai, Rule34, Steam, Wikipedia, Google, Anime, Fandom |
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
│   │   ├── admin/             # 16 commands: automod, ban, case, clearwarns, delete,
│   │   │                      #   delwarn, kick, lockdown, mute, raid, setting,
│   │   │                      #   slowmode, snipe, warn, warnings
│   │   ├── api/               # 10 commands: anime, fandom, google, nhentai, pixiv,
│   │   │                      #   reddit, rule34, steam, wikipedia
│   │   ├── fun/               # 2 commands: deathbattle, say
│   │   ├── general/           # 9 commands: afk, avatar, help, invite, ping,
│   │   │                      #   report, roleinfo, serverinfo
│   │   ├── music/             # Music player (play, skip, queue, volume, etc.)
│   │   ├── video/             # Video download commands
│   │   └── owner/             # Bot owner: botcheck
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
│   │   ├── CacheService.ts    # Redis + memory fallback (1170 lines)
│   │   └── CacheManager.ts    # Cache orchestration
│   │
│   ├── 📁 database/           # Database layer
│   │   ├── postgres.ts        # PostgreSQL with write queue
│   │   └── admin.ts           # Admin queries
│   │
│   ├── 📁 events/             # Discord event listeners
│   │   ├── messageCreate.ts   # Message handling + automod
│   │   ├── voiceStateUpdate.ts # Voice channel events
│   │   └── ready.ts           # Bot ready event
│   │
│   ├── 📁 middleware/         # Request middleware
│   │   ├── access.ts          # Permission & cooldown checks
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
│   ├── unit/                  # 177 unit tests
│   └── integration/           # Integration test framework
│
├── 📁 docker/
│   └── init/                  # PostgreSQL init scripts
│
├── 📁 docs/
│   ├── ARCHITECTURE_ROADMAP.md
│   ├── SHARD_SAFETY.md
│   ├── POTENTIAL_BUGS.md
│   └── MONITORING.md
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
cp .env.example .env
# Edit .env with your credentials

# 4. Start Docker services (PostgreSQL, Lavalink)
npm run docker:up

# 5. Run the bot
npm start
```

### Development Mode

```bash
npm run dev  # Auto-restart on file changes
```

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

### 🛡️ Admin Commands (16 commands)

| Command | Description | Permission |
|---------|-------------|------------|
| `/automod <action>` | Configure automatic moderation (spam, links, etc.) | Administrator |
| `/ban <user> [reason] [days]` | Ban a user with optional message deletion | Ban Members |
| `/case <case_id>` | View details of a moderation case | Moderate Members |
| `/clearwarns <user>` | Clear all warnings for a user | Moderate Members |
| `/delete <amount>` | Bulk delete messages (1-100) | Manage Messages |
| `/delwarn <warn_id>` | Delete a specific warning | Moderate Members |
| `/kick <user> [reason]` | Kick a user from the server | Kick Members |
| `/lockdown <action> [channel]` | Lock/unlock channel or entire server | Manage Channels |
| `/mute <user> <duration> [reason]` | Timeout a user | Moderate Members |
| `/raid <action>` | Anti-raid controls (enable/disable/status) | Administrator |
| `/setting <option> <value>` | Configure guild settings | Administrator |
| `/slowmode <seconds> [channel]` | Set channel slowmode (0-21600) | Manage Channels |
| `/snipe [channel] [index]` | View recently deleted messages | Manage Messages |
| `/warn <user> <reason>` | Warn a user | Moderate Members |
| `/warnings <user>` | View warnings for a user | Moderate Members |

### 🎵 Music Commands

| Command | Description |
|---------|-------------|
| `/music play <query>` | Play a song or add to queue |
| `/music stop` | Stop playback and clear queue |
| `/music skip` | Skip current track |
| `/music queue` | View current queue |
| `/music volume <1-200>` | Adjust volume |
| `/music pause` | Pause/Resume playback |
| `/music loop <off\|track\|queue>` | Set loop mode |
| `/music shuffle` | Shuffle the queue |
| `/music nowplaying` | Show current track info |
| `/music seek <time>` | Seek to position |
| `/music lyrics` | Get lyrics for current song |
| `/music favorites` | Manage favorite tracks |

#### Music Controls (Button Interface)

```
┌─────────────────────────────────────────────────────┐
│  ⏸️ Pause  │  ⏹️ Stop  │  ⏭️ Skip  │  🔁 Loop  │  🔀 Shuffle  │
├─────────────────────────────────────────────────────┤
│  🔉 -10  │  🔊 +10  │  📋 Queue  │  🎵 Autoplay  │
├─────────────────────────────────────────────────────┤
│  🔗 Open Link  │  📝 Lyrics  │  🗳️ Vote Skip  │
└─────────────────────────────────────────────────────┘
```

**Autoplay Feature:**
- When enabled, automatically finds and plays similar tracks when queue ends
- Disables Shuffle and Loop modes (they conflict with autoplay logic)
- Uses intelligent search strategies based on artist, genre, and track similarity

### 🔌 API Commands (10 commands)

| Command | Description |
|---------|-------------|
| `/anime <title>` | Search anime on AniList/MyAnimeList |
| `/fandom <wiki> <query>` | Search Fandom wikis |
| `/google <query>` | Google search |
| `/nhentai <query>` | Search NHentai (NSFW) |
| `/pixiv <query>` | Search Pixiv artwork |
| `/reddit <subreddit>` | Get posts from subreddit |
| `/rule34 <query>` | Search Rule34 (NSFW) |
| `/steam <game>` | Get Steam game info & deals |
| `/wikipedia <query> [language]` | Search Wikipedia (multi-language) |

### 📹 Video Commands

| Command | Description |
|---------|-------------|
| `/video download <url>` | Download video (YouTube, TikTok, Twitter, Instagram, etc.) |

Supported platforms: YouTube, TikTok, Twitter/X, Instagram, Reddit, Twitch clips, and more via Cobalt API + yt-dlp fallback.

### 🎮 Fun Commands

| Command | Description |
|---------|-------------|
| `/deathbattle <user1> <user2> [skillset]` | Simulate anime-style battle between users |
| `/say <message>` | Make the bot say something |

**Death Battle Skillsets:**
- **Jujutsu Kaisen** - Cursed techniques, Domain Expansion
- **Naruto** - Jutsu, Sharingan, Sage Mode
- **One Piece** - Devil Fruits, Haki
- **Demon Slayer** - Breathing styles, Demon abilities

### 📊 General Commands (9 commands)

| Command | Description |
|---------|-------------|
| `/afk [reason]` | Set AFK status (auto-responds when mentioned) |
| `/avatar [user]` | Get user's avatar in high resolution |
| `/help [command]` | View command help |
| `/invite` | Bot invite link |
| `/ping` | Check bot latency and API response time |
| `/report <issue>` | Report a bug/issue to developers |
| `/roleinfo <role>` | View role information and permissions |
| `/serverinfo` | Server information and statistics |

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

### PostgreSQL Tables

```sql
-- Guild settings
CREATE TABLE guild_settings (
    guild_id VARCHAR(20) PRIMARY KEY,
    prefix VARCHAR(10) DEFAULT '!',
    nsfw_enabled BOOLEAN DEFAULT false,
    mod_log_channel VARCHAR(20),
    settings JSONB DEFAULT '{}'
);

-- Command usage analytics
CREATE TABLE command_usage (
    id SERIAL PRIMARY KEY,
    guild_id VARCHAR(20),
    user_id VARCHAR(20),
    command_name VARCHAR(50),
    used_at TIMESTAMP DEFAULT NOW()
);

-- Moderation logs
CREATE TABLE mod_logs (
    id SERIAL PRIMARY KEY,
    guild_id VARCHAR(20),
    moderator_id VARCHAR(20),
    target_id VARCHAR(20),
    action VARCHAR(20),
    reason TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
```

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
- `node-fetch` ^2.7 - Fetch API

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

**Current Coverage:** 177 unit tests passing

---

## 🔀 Multi-Shard Deployment

alterGolden is fully shard-safe. All runtime state is stored in Redis.

```bash
# Start with sharding (auto-calculated)
node src/sharding.js

# Or specify shard count
TOTAL_SHARDS=4 node src/sharding.js
```

See [docs/SHARD_SAFETY.md](docs/SHARD_SAFETY.md) for details.

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| [ARCHITECTURE_ROADMAP.md](docs/ARCHITECTURE_ROADMAP.md) | Full architecture overview (8.5/10 score) |
| [SHARD_SAFETY.md](docs/SHARD_SAFETY.md) | Multi-shard deployment guide |
| [POTENTIAL_BUGS.md](docs/POTENTIAL_BUGS.md) | Known issues and future improvements |
| [MONITORING.md](docs/MONITORING.md) | Prometheus/Grafana setup |
| [SHARDING.md](docs/SHARDING.md) | Discord sharding config |
| [ROADMAP_8.5.md](docs/ROADMAP_8.5.md) | Migration progress tracker |

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

**Made with ❤️ by alterGolden Team**

[Report Bug](../../issues) · [Request Feature](../../issues)

</div>
