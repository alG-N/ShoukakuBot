# 🚀 alterGolden Bot - Quick Start

## 📌 Development (Single Shard - Recommended for Dev)
```powershell
# Clean build và chạy (ưu tiên dùng cái này khi dev)
Set-Location "d:\Project\FumoBOT\Shoukaku - Backend"; Remove-Item -Recurse -Force dist -ErrorAction SilentlyContinue; npx tsc; node dist/index.js
```

## 📌 Quick Restart (Clean build)
```powershell
Set-Location "C:\Users\alterGolden\Desktop\ShoukakuBOT\Shoukaku - Backend"; Remove-Item -Recurse -Force dist -ErrorAction SilentlyContinue; npx tsc; node dist/index.js
```

## 📌 Quick Restart (không cần clean)
```powershell
# Stop bot cũ, compile, chạy lại
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force; Start-Sleep -Seconds 2; npx tsc; node dist/index.js
```

## 📌 Production (Multi-Shard - 1000+ servers)
```powershell
# Dùng ShardingManager để spawn nhiều shards
Set-Location "d:\Project\FumoBOT\Shoukaku - Backend"; Remove-Item -Recurse -Force dist -ErrorAction SilentlyContinue; npx tsc; node dist/sharding.js
```

---

## 🔄 PM2 - Process Manager (Auto-restart & Production)

### Cài đặt PM2
```powershell
npm install -g pm2
```

### Chạy với PM2
```powershell
# Build trước
Set-Location "d:\Project\FumoBOT\Shoukaku - Backend"; npx tsc

# Start single shard (dev/small production)
pm2 start dist/index.js --name "shoukaku"

# Start multi-shard (large production)
pm2 start dist/sharding.js --name "shoukaku-sharding"
```

### PM2 Commands thường dùng
```powershell
pm2 list                    # Xem tất cả processes
pm2 logs shoukaku        # Xem logs realtime
pm2 logs shoukaku --lines 100  # Xem 100 dòng log gần nhất
pm2 restart shoukaku     # Restart bot
pm2 stop shoukaku        # Stop bot
pm2 delete shoukaku      # Xóa khỏi PM2
pm2 monit                   # Dashboard monitor CPU/RAM
```

### Auto-start khi Windows boot
```powershell
# Lưu current processes
pm2 save

# Tạo startup script (chạy PowerShell as Admin)
pm2-startup install
```

### Rebuild & Restart
```powershell
# Clean build và restart PM2
Set-Location "d:\Project\FumoBOT\Shoukaku - Backend"; Remove-Item -Recurse -Force dist -ErrorAction SilentlyContinue; npx tsc; pm2 restart shoukaku
```

---

## 🔧 Khi nào dùng gì?

| Lệnh | Khi nào dùng |
|------|--------------|
| `node dist/index.js` | Dev local, test features, < 2500 servers |
| `node dist/sharding.js` | Production, 1000+ servers, cần scale |
| `pm2 start dist/index.js` | Production với auto-restart, monitoring |
| `pm2 start dist/sharding.js` | Production lớn, multi-shard + auto-restart |

## ⚙️ Environment Variables (Sharding)
```env
SHARD_COUNT=auto              # Tự động tính, hoặc set cụ thể: 2, 4, 8...
SHARD_RESPAWN_DELAY=5000      # Delay giữa các shard spawn (ms)
SHARD_SPAWN_TIMEOUT=30000     # Timeout per shard (ms)
SHARD_HEALTH_PORT=3001        # Health check port cho sharding manager
```

## 📊 Health Check URLs
- **Bot health:** http://localhost:3000/health
- **Bot metrics:** http://localhost:3000/metrics
- **Sharding health:** http://localhost:3001/health (chỉ khi dùng sharding.js)

---

## 📈 Monitoring (Prometheus + Grafana)

### Cách hoạt động (100% PASSIVE)
```
┌─────────────┐    scrape /metrics     ┌─────────────┐    query      ┌─────────────┐
│  Bot        │  ◄──────────────────── │ Prometheus  │ ◄──────────── │  Grafana    │
│ :3000       │      every 15s         │ :9090       │               │ :3030       │
└─────────────┘                        └─────────────┘               └─────────────┘
     │                                       │                             │
     │ expose metrics                        │ store time-series           │ visualize
     └───────────────────────────────────────┴─────────────────────────────┘
```

**Giải thích:**
1. **Bot** expose metrics dạng text tại `http://localhost:3000/metrics`
2. **Prometheus** tự động "scrape" (kéo data) mỗi 15 giây, lưu vào time-series database
3. **Grafana** query Prometheus và hiển thị charts, alerts

**Bạn KHÔNG cần làm gì** - hệ thống tự động thu thập khi bot chạy!

### Start/Stop Monitoring
```powershell
# Start (trong thư mục alterGolden-Backend)
docker-compose up -d prometheus grafana

# Stop
docker-compose stop prometheus grafana

# Xem logs
docker logs altergolden-grafana
docker logs altergolden-prometheus
```

### Access URLs
| Service | URL | Login |
|---------|-----|-------|
| Grafana | http://localhost:3030 | admin / admin |
| Prometheus | http://localhost:9090 | - |
| Bot Metrics | http://localhost:3000/metrics | - |

### Metrics được thu thập
- **Discord:** Gateway latency, guilds, users, uptime
- **Commands:** Số lần chạy, thời gian thực thi, errors
- **Music:** Active players, queue size, voice connections
- **Cache:** Hit ratio, Redis status
- **System:** Memory (heap), CPU, GC duration
- **AutoMod:** Violations, actions taken

### Dashboard có sẵn
Mở Grafana → Menu ☰ → Dashboards → **Shoukaku Bot Overview**

Sections:
- 📊 Overview: Latency, guilds, users, redis status
- ⚡ Commands: Rate, latency, errors
- 🎵 Music: Players, queue
- 💾 System: Memory, CPU
- 🔒 AutoMod: Violations, actions

