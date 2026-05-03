# Monitoring Guide - alterGolden Bot

Complete guide for monitoring the alterGolden Discord bot using Prometheus and Grafana.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Available Metrics](#available-metrics)
3. [Prometheus Setup](#prometheus-setup)
4. [Grafana Dashboards](#grafana-dashboards)
5. [Alerting](#alerting)
6. [Best Practices](#best-practices)

---

## Quick Start

### Prerequisites

- Docker & Docker Compose
- alterGolden bot running with health server enabled

### Start Monitoring Stack

```bash
cd monitoring
docker-compose up -d
```

Access:
- **Bot Live Dashboard**: http://localhost:3000
- **Grafana**: http://localhost:3030 (admin/admin)
- **Prometheus**: http://localhost:9090

LAN access:
- By default the bot dashboard is published only to `127.0.0.1`.
- Set `HEALTH_BIND_HOST=0.0.0.0` in `.env` if you want to open port 3000 to other devices on your network.
- Optionally set `HEALTH_PUBLISHED_PORT` if you want to expose a different external port.

### Verify Metrics Collection

1. Open Prometheus: http://localhost:9090
2. Query: `altergolden_discord_guilds_total`
3. Should see guild count metric

---

## Available Metrics

### Discord Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `altergolden_discord_gateway_latency_ms` | Gauge | WebSocket latency (ms) |
| `altergolden_discord_guilds_total` | Gauge | Total guilds |
| `altergolden_discord_users_total` | Gauge | Total users |
| `altergolden_discord_channels_total` | Gauge | Total channels |
| `altergolden_discord_uptime_seconds` | Gauge | Bot uptime |

### Command Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `altergolden_commands_executed_total` | Counter | command, category, status | Total commands executed |
| `altergolden_command_execution_duration_seconds` | Histogram | command, category | Execution duration |
| `altergolden_command_errors_total` | Counter | command, category, error_type | Total errors |
| `altergolden_commands_active` | Gauge | command | Currently executing |

### Music Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `altergolden_music_players_active` | Gauge | Active music players |
| `altergolden_music_queue_size_total` | Gauge | Total tracks in queues |
| `altergolden_music_voice_connections` | Gauge | Voice connections |
| `altergolden_lavalink_node_status` | Gauge | Lavalink node status |

### Cache Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `altergolden_cache_hit_ratio` | Gauge | Cache hit ratio |
| `altergolden_cache_operations_total` | Counter | Cache operations |
| `altergolden_redis_connection_status` | Gauge | Redis connection (1/0) |

### AutoMod Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `altergolden_automod_violations_total` | Counter | type, guild_id | Violations detected |
| `altergolden_automod_actions_total` | Counter | action, guild_id | Actions taken |

### System Metrics (from prom-client)

Default Node.js metrics are prefixed with `altergolden_`:
- `altergolden_nodejs_heap_size_used_bytes`
- `altergolden_nodejs_heap_size_total_bytes`
- `altergolden_nodejs_external_memory_bytes`
- `altergolden_process_cpu_seconds_total`
- `altergolden_nodejs_eventloop_lag_seconds`

---

## Prometheus Setup

### Configuration

Edit `monitoring/prometheus/prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'altergolden'
    static_configs:
      - targets: ['host.docker.internal:3000']
    metrics_path: /metrics
    scrape_interval: 10s
```

### Multiple Shards

For sharded deployments, add each shard:

```yaml
- job_name: 'altergolden-shards'
  static_configs:
    - targets:
      - 'host.docker.internal:3000'  # Shard 0
      - 'host.docker.internal:3001'  # Shard 1
      - 'host.docker.internal:3002'  # Shard 2
```

### Useful PromQL Queries

```promql
# Command success rate
sum(rate(altergolden_commands_executed_total{status="success"}[5m])) 
/ sum(rate(altergolden_commands_executed_total[5m]))

# P95 command latency
histogram_quantile(0.95, 
  sum(rate(altergolden_command_execution_duration_seconds_bucket[5m])) by (le)
)

# Commands per minute by category
sum(rate(altergolden_commands_executed_total[1m])) by (category) * 60

# Memory growth rate (MB/hour)
delta(altergolden_nodejs_heap_size_used_bytes[1h]) / 1024 / 1024
```

---

## Grafana Dashboards

### Pre-built Dashboard

The monitoring stack includes a pre-built dashboard:
- **alterGolden Bot Overview**: General bot metrics

### Dashboard Sections

1. **Overview**: Gateway latency, guild/user counts, uptime
2. **Commands**: Execution rate, latency, errors
3. **Music**: Active players, queue sizes
4. **System**: Memory, CPU usage
5. **AutoMod**: Violations and actions

### Custom Dashboard

Create new dashboards using Grafana's UI and export as JSON to `monitoring/grafana/dashboards/`.

---

## Alerting

### Enable Alertmanager

```bash
docker-compose --profile alerting up -d
```

### Configure Alerts

1. Edit `monitoring/alertmanager/alertmanager.yml`
2. Add Discord webhook URL
3. Restart Alertmanager

### Alert Rules

Pre-configured alerts in `monitoring/prometheus/alerts/altergolden.yml`:

| Alert | Severity | Threshold |
|-------|----------|-----------|
| BotDisconnected | Critical | Uptime = 0 for 1m |
| HighGatewayLatency | Warning | >500ms for 5m |
| HighCommandErrorRate | Warning | >10% for 5m |
| LavalinkNodeDown | Critical | Disconnected 2m |
| RedisDisconnected | Critical | Down for 1m |

### Discord Webhook Integration

For Discord notifications, use Alertmanager's webhook:

1. Create Discord webhook in your alerts channel
2. Add webhook URL to alertmanager.yml
3. Use a Discord webhook proxy like [alertmanager-discord](https://github.com/benjojo/alertmanager-discord)

---

## Best Practices

### 1. Metric Labels

Keep cardinality low:
- ✅ Use category labels (admin, music, api)
- ❌ Avoid user_id or message_id labels

### 2. Retention

Configure Prometheus retention:
```yaml
command:
  - '--storage.tsdb.retention.time=30d'
```

### 3. Recording Rules

For expensive queries, create recording rules:

```yaml
groups:
  - name: altergolden_recording
    rules:
      - record: altergolden:command_success_rate:5m
        expr: |
          sum(rate(altergolden_commands_executed_total{status="success"}[5m])) 
          / sum(rate(altergolden_commands_executed_total[5m]))
```

### 4. Grafana Alerts

Complement Prometheus alerts with Grafana alerts for:
- Dashboard-specific thresholds
- Team-specific notification channels

---

## Troubleshooting

### Metrics Not Appearing

1. Check bot health server: `curl http://localhost:3000/metrics`
2. Verify Prometheus targets: http://localhost:9090/targets
3. Check Docker network: bot should be accessible from Prometheus

### High Cardinality Warning

If Prometheus warns about cardinality:
- Check for dynamic label values
- Review command names (should be finite set)

### Grafana Can't Connect to Prometheus

1. Check Prometheus is running: `docker-compose ps`
2. Verify datasource URL in Grafana settings
3. Try `prometheus:9090` instead of `localhost:9090`

---

## Resources

- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)
- [prom-client (Node.js)](https://github.com/siimon/prom-client)
- [Alertmanager](https://prometheus.io/docs/alerting/latest/alertmanager/)
