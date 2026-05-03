/**
 * Health Check Service
 * Provides health status for the application
 * Used by load balancers, Kubernetes probes, and monitoring
 * @module core/health
 */

import os from 'os';
import * as http from 'http';
import type { Server, IncomingMessage, ServerResponse } from 'http';
import logger from './Logger.js';
import {
    getMetrics,
    getContentType,
    httpRequestDuration,
    httpRequestsTotal
} from './metrics.js';
import type {
    HealthStatus,
    HealthCheckResult,
    HealthCheckEntry,
    HealthResponse,
    ServiceConfig,
    HealthState
} from '../types/core/health.js';
export { type HealthStatus, type HealthCheckResult, type HealthCheckEntry, type HealthResponse, type ServiceConfig, type HealthState };
// TYPES
// STATE

const healthState: HealthState = {
    status: 'starting',
    startTime: Date.now(),
    checks: {}
};

// Registered health checks
const healthChecks = new Map<string, () => Promise<HealthCheckResult>>();
const dashboardServices: ServiceConfig = {};

type DashboardSnapshot = {
        generatedAt: string;
        lifecycleStatus: HealthStatus;
        overallStatus: HealthResponse['status'];
        uptimeSeconds: number;
        health: HealthResponse;
        process: Record<string, unknown>;
        discord: Record<string, unknown> | null;
        cache: ReturnType<NonNullable<ServiceConfig['cacheService']>['getStats']> | null;
        lavalink: ReturnType<NonNullable<NonNullable<ServiceConfig['lavalink']>['getNodeStatus']>> | null;
        circuitBreakers: Record<string, unknown> | null;
        degradation: ReturnType<NonNullable<NonNullable<ServiceConfig['gracefulDegradation']>['getStatus']>> | null;
        endpoints: Record<string, string>;
};
// FUNCTIONS

function getRequestPath(req: IncomingMessage): string {
        try {
                return new URL(req.url || '/', 'http://127.0.0.1').pathname;
        } catch {
                return (req.url || '/').split('?')[0] || '/';
        }
}

function recordRequestMetrics(method: string, path: string, statusCode: number, startedAt: number): void {
        httpRequestsTotal.inc({ method, path, status_code: String(statusCode) });
        httpRequestDuration.observe({ method, path }, (Date.now() - startedAt) / 1000);
}

function sendResponse(
        res: ServerResponse,
        method: string,
        path: string,
        startedAt: number,
        statusCode: number,
        body: string,
        contentType: string
): void {
        res.statusCode = statusCode;
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'no-store');
        res.end(body);
        recordRequestMetrics(method, path, statusCode, startedAt);
}

async function buildDashboardData(): Promise<DashboardSnapshot> {
        const health = await runHealthChecks();
        const client = dashboardServices.client;
        const cache = dashboardServices.cacheService?.getStats() ?? null;
        const lavalink = dashboardServices.lavalink?.getNodeStatus?.() ?? null;
        const circuitBreakers = dashboardServices.circuitBreakerRegistry
                ? {
                        health: dashboardServices.circuitBreakerRegistry.getHealth(),
                        summary: dashboardServices.circuitBreakerRegistry.getSummary()
                }
                : null;
        const degradation = dashboardServices.gracefulDegradation?.getStatus?.() ?? null;

        const memory = process.memoryUsage();
        const cpu = process.cpuUsage();

        const discord = client
                ? {
                        ready: client.isReady(),
                        pingMs: client.ws.ping,
                        guilds: client.guilds.cache.size,
                        users: client.guilds.cache.reduce((sum, guild) => sum + guild.memberCount, 0),
                        channels: client.channels.cache.size,
                        shardIds: client.shard?.ids ?? [0],
                        shardCount: client.shard?.count ?? 1,
                }
                : null;

        return {
                generatedAt: new Date().toISOString(),
                lifecycleStatus: healthState.status,
                overallStatus: health.status,
                uptimeSeconds: health.uptime,
                health,
                process: {
                        pid: process.pid,
                        node: process.version,
                        platform: os.platform(),
                        arch: os.arch(),
                        hostname: os.hostname(),
                        processUptimeSeconds: Math.floor(process.uptime()),
                        rssBytes: memory.rss,
                        heapUsedBytes: memory.heapUsed,
                        heapTotalBytes: memory.heapTotal,
                        externalBytes: memory.external,
                        arrayBuffersBytes: memory.arrayBuffers ?? 0,
                        cpuUserMicros: cpu.user,
                        cpuSystemMicros: cpu.system,
                        totalSystemMemoryBytes: os.totalmem(),
                        freeSystemMemoryBytes: os.freemem(),
                        loadAverage: os.loadavg(),
                },
                discord,
                cache,
                lavalink,
                circuitBreakers,
                degradation,
                endpoints: {
                        dashboard: '/',
                        dashboardJson: '/dashboard.json',
                        stats: '/stats',
                        health: '/health',
                        ready: '/ready',
                        live: '/live',
                        metrics: '/metrics',
                        grafana: 'http://localhost:3030',
                }
        };
}

function buildDashboardHtml(): string {
        return `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Shoukaku Live Dashboard</title>
    <style>
        :root {
            color-scheme: dark;
            --bg: #07131d;
            --bg-accent: #11324a;
            --panel: rgba(10, 28, 41, 0.86);
            --panel-strong: rgba(14, 39, 56, 0.96);
            --line: rgba(255, 255, 255, 0.1);
            --text: #f3fbff;
            --muted: #9fbbca;
            --ok: #4ade80;
            --warn: #fbbf24;
            --bad: #f87171;
            --info: #38bdf8;
            --accent: #f59e0b;
            --shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
            font-family: "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif;
        }

        * { box-sizing: border-box; }

        body {
            margin: 0;
            min-height: 100vh;
            background:
                radial-gradient(circle at top left, rgba(56, 189, 248, 0.18), transparent 28%),
                radial-gradient(circle at top right, rgba(245, 158, 11, 0.14), transparent 24%),
                linear-gradient(180deg, var(--bg-accent), var(--bg));
            color: var(--text);
        }

        a {
            color: inherit;
            text-decoration: none;
        }

        .shell {
            width: min(1440px, calc(100vw - 32px));
            margin: 0 auto;
            padding: 24px 0 40px;
        }

        .hero {
            display: grid;
            gap: 16px;
            grid-template-columns: 1.4fr 1fr;
            margin-bottom: 16px;
        }

        .panel,
        .hero-card,
        .card {
            border: 1px solid var(--line);
            background: var(--panel);
            border-radius: 24px;
            box-shadow: var(--shadow);
            backdrop-filter: blur(14px);
        }

        .hero-card {
            padding: 24px;
        }

        .hero-card h1 {
            margin: 0;
            font-size: clamp(1.8rem, 4vw, 3rem);
            line-height: 1.05;
        }

        .subline,
        .hint,
        .caption,
        .meta {
            color: var(--muted);
        }

        .subline {
            margin-top: 8px;
            font-size: 0.98rem;
            max-width: 60ch;
        }

        .status-row,
        .link-row,
        .meta-row,
        .pill-row {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
        }

        .status-row,
        .meta-row {
            margin-top: 16px;
        }

        .link-row {
            margin-top: 18px;
        }

        .pill,
        .link-pill {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            border-radius: 999px;
            border: 1px solid var(--line);
            padding: 8px 12px;
            font-size: 0.92rem;
            background: rgba(255, 255, 255, 0.04);
        }

        .pill.ok { border-color: rgba(74, 222, 128, 0.4); color: var(--ok); }
        .pill.warn { border-color: rgba(251, 191, 36, 0.4); color: var(--warn); }
        .pill.bad { border-color: rgba(248, 113, 113, 0.45); color: var(--bad); }
        .pill.info { border-color: rgba(56, 189, 248, 0.4); color: var(--info); }

        .link-pill:hover {
            border-color: rgba(255, 255, 255, 0.24);
            transform: translateY(-1px);
        }

        .refresh-card {
            padding: 24px;
            background: linear-gradient(160deg, rgba(245, 158, 11, 0.18), rgba(56, 189, 248, 0.1));
        }

        .refresh-card h2 {
            margin: 0;
            font-size: 1.1rem;
            letter-spacing: 0.04em;
            text-transform: uppercase;
        }

        .refresh-value {
            margin-top: 18px;
            font-size: clamp(1.6rem, 4vw, 2.5rem);
            font-weight: 700;
        }

        .overview-grid {
            display: grid;
            gap: 14px;
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
            margin-bottom: 16px;
        }

        .card {
            padding: 18px;
            min-height: 126px;
        }

        .card-label {
            color: var(--muted);
            font-size: 0.82rem;
            letter-spacing: 0.08em;
            text-transform: uppercase;
        }

        .card-value {
            margin-top: 14px;
            font-size: clamp(1.3rem, 2.6vw, 2rem);
            font-weight: 700;
            line-height: 1.05;
            word-break: break-word;
        }

        .card-note {
            margin-top: 10px;
            color: var(--muted);
            font-size: 0.9rem;
        }

        .grid {
            display: grid;
            gap: 16px;
            grid-template-columns: repeat(12, minmax(0, 1fr));
        }

        .panel {
            padding: 20px;
        }

        .panel h2 {
            margin: 0 0 14px;
            font-size: 1rem;
            letter-spacing: 0.08em;
            text-transform: uppercase;
        }

        .span-4 { grid-column: span 4; }
        .span-6 { grid-column: span 6; }
        .span-8 { grid-column: span 8; }
        .span-12 { grid-column: span 12; }

        .checks,
        .list {
            display: grid;
            gap: 10px;
        }

        .check {
            border: 1px solid var(--line);
            border-radius: 18px;
            padding: 12px 14px;
            background: rgba(255, 255, 255, 0.03);
        }

        .check-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            margin-bottom: 8px;
        }

        .check-title {
            font-weight: 600;
        }

        .check-body {
            display: grid;
            gap: 8px;
            font-size: 0.92rem;
            color: var(--muted);
        }

        .kv {
            display: grid;
            gap: 8px;
        }

        .kv-row {
            display: grid;
            grid-template-columns: minmax(120px, 180px) 1fr;
            gap: 12px;
            padding: 8px 0;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }

        .kv-row:last-child {
            border-bottom: 0;
            padding-bottom: 0;
        }

        .kv-key {
            color: var(--muted);
            text-transform: capitalize;
        }

        .kv-value {
            word-break: break-word;
        }

        .chips {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
        }

        .chip {
            padding: 6px 10px;
            border-radius: 999px;
            background: rgba(255, 255, 255, 0.07);
            border: 1px solid rgba(255, 255, 255, 0.08);
            font-size: 0.88rem;
        }

        pre {
            margin: 0;
            padding: 16px;
            border-radius: 18px;
            background: var(--panel-strong);
            border: 1px solid rgba(255, 255, 255, 0.06);
            color: #d7f0ff;
            overflow: auto;
            font: 0.84rem/1.55 "Cascadia Code", Consolas, monospace;
            max-height: 460px;
        }

        .empty {
            padding: 18px;
            border-radius: 18px;
            border: 1px dashed rgba(255, 255, 255, 0.14);
            color: var(--muted);
            text-align: center;
        }

        .footer-note {
            margin-top: 18px;
            text-align: right;
            font-size: 0.88rem;
            color: var(--muted);
        }

        @media (max-width: 1080px) {
            .hero { grid-template-columns: 1fr; }
            .span-4, .span-6, .span-8, .span-12 { grid-column: span 12; }
        }

        @media (max-width: 720px) {
            .shell { width: min(100vw - 20px, 1440px); padding-top: 16px; }
            .hero-card, .refresh-card, .panel, .card { border-radius: 20px; }
            .kv-row { grid-template-columns: 1fr; gap: 4px; }
        }
    </style>
</head>
<body>
    <div class="shell">
        <section class="hero">
            <article class="hero-card">
                <h1>Shoukaku Live Dashboard</h1>
                <p class="subline">Port 3000 stays the bot health surface. Root now renders a detailed live view while the machine-friendly endpoints remain available for Docker and Prometheus.</p>
                <div class="status-row" id="statusRow"></div>
                <div class="link-row">
                    <a class="link-pill" href="/health" target="_blank" rel="noreferrer">/health</a>
                    <a class="link-pill" href="/metrics" target="_blank" rel="noreferrer">/metrics</a>
                    <a class="link-pill" href="/dashboard.json" target="_blank" rel="noreferrer">/dashboard.json</a>
                    <a class="link-pill" href="http://localhost:3030" target="_blank" rel="noreferrer">Grafana :3030</a>
                </div>
                <div class="meta-row">
                    <span class="pill info">Auto-refresh 5s</span>
                    <span class="pill info" id="snapshotAt">Waiting for first snapshot</span>
                    <span class="pill info" id="fetchState">Connecting</span>
                </div>
            </article>
            <aside class="hero-card refresh-card">
                <h2>Refresh State</h2>
                <div class="refresh-value" id="refreshSummary">Loading</div>
                <p class="hint">If this page is unreachable, the bot container itself is usually not running. Grafana remains separate on port 3030.</p>
                <div class="meta-row">
                    <span class="pill info" id="lifecycleBadge">Lifecycle: starting</span>
                    <span class="pill info" id="overallBadge">Health: unknown</span>
                </div>
            </aside>
        </section>

        <section class="overview-grid" id="overviewGrid"></section>

        <section class="grid">
            <article class="panel span-4">
                <h2>Health Checks</h2>
                <div class="checks" id="healthChecks"></div>
            </article>

            <article class="panel span-4">
                <h2>Cache</h2>
                <div id="cacheSummary"></div>
            </article>

            <article class="panel span-4">
                <h2>Lavalink</h2>
                <div id="lavalinkSummary"></div>
            </article>

            <article class="panel span-6">
                <h2>Discord</h2>
                <div id="discordSummary"></div>
            </article>

            <article class="panel span-6">
                <h2>Process</h2>
                <div id="processSummary"></div>
            </article>

            <article class="panel span-6">
                <h2>Circuit Breakers</h2>
                <div id="circuitSummary"></div>
            </article>

            <article class="panel span-6">
                <h2>Graceful Degradation</h2>
                <div id="degradationSummary"></div>
            </article>

            <article class="panel span-12">
                <h2>Raw Snapshot</h2>
                <pre id="rawSnapshot">Waiting for data...</pre>
            </article>
        </section>

        <div class="footer-note">Detailed health checks refresh automatically every 5 seconds.</div>
    </div>

    <script>
        const REFRESH_MS = 5000;

        const statusRow = document.getElementById('statusRow');
        const snapshotAt = document.getElementById('snapshotAt');
        const fetchState = document.getElementById('fetchState');
        const refreshSummary = document.getElementById('refreshSummary');
        const lifecycleBadge = document.getElementById('lifecycleBadge');
        const overallBadge = document.getElementById('overallBadge');
        const overviewGrid = document.getElementById('overviewGrid');
        const healthChecks = document.getElementById('healthChecks');
        const cacheSummary = document.getElementById('cacheSummary');
        const lavalinkSummary = document.getElementById('lavalinkSummary');
        const discordSummary = document.getElementById('discordSummary');
        const processSummary = document.getElementById('processSummary');
        const circuitSummary = document.getElementById('circuitSummary');
        const degradationSummary = document.getElementById('degradationSummary');
        const rawSnapshot = document.getElementById('rawSnapshot');

        function toneForStatus(status) {
            if (status === 'healthy') return 'ok';
            if (status === 'starting' || status === 'warn' || status === 'degraded') return 'warn';
            return 'bad';
        }

        function escapeHtml(value) {
            return String(value)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function formatNumber(value) {
            if (value === null || value === undefined || Number.isNaN(Number(value))) return 'n/a';
            return Number(value).toLocaleString();
        }

        function formatBytes(value) {
            if (value === null || value === undefined || Number.isNaN(Number(value))) return 'n/a';
            const units = ['B', 'KB', 'MB', 'GB', 'TB'];
            let amount = Number(value);
            let unitIndex = 0;
            while (amount >= 1024 && unitIndex < units.length - 1) {
                amount /= 1024;
                unitIndex += 1;
            }
            return amount.toFixed(amount >= 10 || unitIndex === 0 ? 0 : 1) + ' ' + units[unitIndex];
        }

        function formatUptime(seconds) {
            if (seconds === null || seconds === undefined || Number.isNaN(Number(seconds))) return 'n/a';
            const totalSeconds = Math.max(0, Math.floor(Number(seconds)));
            const days = Math.floor(totalSeconds / 86400);
            const hours = Math.floor((totalSeconds % 86400) / 3600);
            const minutes = Math.floor((totalSeconds % 3600) / 60);
            const secs = totalSeconds % 60;
            const parts = [];
            if (days) parts.push(days + 'd');
            if (hours || days) parts.push(hours + 'h');
            if (minutes || hours || days) parts.push(minutes + 'm');
            parts.push(secs + 's');
            return parts.join(' ');
        }

        function formatPercent(value) {
            if (value === null || value === undefined || Number.isNaN(Number(value))) return 'n/a';
            return (Number(value) * 100).toFixed(1) + '%';
        }

        function jsonBlock(value) {
            return '<pre>' + escapeHtml(JSON.stringify(value, null, 2)) + '</pre>';
        }

        function emptyState(message) {
            return '<div class="empty">' + escapeHtml(message) + '</div>';
        }

        function renderPill(label, value, tone) {
            return '<span class="pill ' + tone + '">' + escapeHtml(label + ': ' + value) + '</span>';
        }

        function renderCard(label, value, note, tone) {
            return '' +
                '<article class="card">' +
                    '<div class="card-label">' + escapeHtml(label) + '</div>' +
                    '<div class="card-value" style="color: var(--' + escapeHtml(tone || 'text') + ');">' + escapeHtml(value) + '</div>' +
                    '<div class="card-note">' + escapeHtml(note || '') + '</div>' +
                '</article>';
        }

        function renderKeyValues(value) {
            if (!value || typeof value !== 'object') {
                return emptyState('No data available yet.');
            }

            const rows = Object.keys(value).map(function (key) {
                const item = value[key];
                let rendered;
                if (Array.isArray(item)) {
                    rendered = item.length ? item.join(', ') : '[]';
                } else if (item && typeof item === 'object') {
                    rendered = JSON.stringify(item);
                } else {
                    rendered = String(item);
                }

                return '' +
                    '<div class="kv-row">' +
                        '<div class="kv-key">' + escapeHtml(key) + '</div>' +
                        '<div class="kv-value">' + escapeHtml(rendered) + '</div>' +
                    '</div>';
            });

            return '<div class="kv">' + rows.join('') + '</div>';
        }

        function renderHealthChecks(checks) {
            const entries = Object.entries(checks || {});
            if (!entries.length) {
                return emptyState('Health checks have not been registered yet.');
            }

            return entries.map(function (entry) {
                const name = entry[0];
                const detail = entry[1] || {};
                const tone = toneForStatus(detail.status);
                const meta = Object.keys(detail)
                    .filter(function (key) { return key !== 'status'; })
                    .map(function (key) {
                        return '<div><strong>' + escapeHtml(key) + '</strong>: ' + escapeHtml(typeof detail[key] === 'object' ? JSON.stringify(detail[key]) : String(detail[key])) + '</div>';
                    })
                    .join('');

                return '' +
                    '<div class="check">' +
                        '<div class="check-head">' +
                            '<div class="check-title">' + escapeHtml(name) + '</div>' +
                            '<span class="pill ' + tone + '">' + escapeHtml(String(detail.status || 'unknown')) + '</span>' +
                        '</div>' +
                        '<div class="check-body">' + meta + '</div>' +
                    '</div>';
            }).join('');
        }

        function renderCache(cache) {
            if (!cache) {
                return emptyState('Cache stats are unavailable.');
            }

            const chips = [];
            if (Array.isArray(cache.namespaces) && cache.namespaces.length) {
                chips.push('<div class="caption">Namespaces</div><div class="chips">' + cache.namespaces.slice(0, 12).map(function (name) {
                    return '<span class="chip">' + escapeHtml(name) + '</span>';
                }).join('') + '</div>');
            }

            if (Array.isArray(cache.topMissNamespaces) && cache.topMissNamespaces.length) {
                chips.push('<div class="caption" style="margin-top: 14px;">Top Miss Namespaces</div><div class="chips">' + cache.topMissNamespaces.map(function (entry) {
                    return '<span class="chip">' + escapeHtml(entry.namespace + ' (' + Math.round((entry.hitRate || 0) * 100) + '% hit)') + '</span>';
                }).join('') + '</div>');
            }

            return renderKeyValues({
                hitRate: formatPercent(cache.hitRate),
                effectiveHitRate: formatPercent(cache.effectiveHitRate),
                hits: formatNumber(cache.hits),
                misses: formatNumber(cache.misses),
                absenceChecks: formatNumber(cache.absenceChecks),
                redisConnected: cache.redisConnected,
                redisState: cache.redisState,
                redisFailures: formatNumber(cache.redisFailures),
                memoryEntries: formatNumber(cache.memoryEntries)
            }) + chips.join('');
        }

        function renderLavalink(lavalink) {
            if (!lavalink) {
                return emptyState('Lavalink has not been registered.');
            }

            const details = {
                ready: lavalink.ready,
                activeConnections: lavalink.activeConnections,
                nodeCount: Array.isArray(lavalink.nodes) ? lavalink.nodes.length : 0,
                playerCount: Array.isArray(lavalink.players) ? lavalink.players.length : 0,
                error: lavalink.error || 'none'
            };

            const nodesBlock = Array.isArray(lavalink.nodes) && lavalink.nodes.length
                ? jsonBlock(lavalink.nodes)
                : emptyState('No node metadata available.');

            return renderKeyValues(details) + '<div class="caption" style="margin: 14px 0 8px;">Nodes</div>' + nodesBlock;
        }

        function renderStatusSummary(data) {
            statusRow.innerHTML = [
                renderPill('Lifecycle', String(data.lifecycleStatus || 'unknown'), toneForStatus(data.lifecycleStatus)),
                renderPill('Health', String(data.overallStatus || 'unknown'), toneForStatus(data.overallStatus)),
                renderPill('Uptime', formatUptime(data.uptimeSeconds), 'info')
            ].join('');

            lifecycleBadge.className = 'pill ' + toneForStatus(data.lifecycleStatus);
            lifecycleBadge.textContent = 'Lifecycle: ' + String(data.lifecycleStatus || 'unknown');

            overallBadge.className = 'pill ' + toneForStatus(data.overallStatus);
            overallBadge.textContent = 'Health: ' + String(data.overallStatus || 'unknown');

            snapshotAt.textContent = 'Snapshot: ' + new Date(data.generatedAt).toLocaleString();
            refreshSummary.textContent = String(data.overallStatus || 'unknown').toUpperCase();
        }

        function renderOverview(data) {
            const discord = data.discord || {};
            const processData = data.process || {};
            const cache = data.cache || {};
            const lavalink = data.lavalink || {};

            overviewGrid.innerHTML = [
                renderCard('Gateway Ping', formatNumber(discord.pingMs) + ' ms', 'Discord websocket heartbeat', toneForStatus(data.overallStatus)),
                renderCard('Guilds', formatNumber(discord.guilds), 'Visible to the current shard process', 'info'),
                renderCard('Users', formatNumber(discord.users), 'Summed from cached guild member counts', 'info'),
                renderCard('Channels', formatNumber(discord.channels), 'Cached Discord channels', 'info'),
                renderCard('Process RSS', formatBytes(processData.rssBytes), 'Resident memory footprint', 'accent'),
                renderCard('Heap Used', formatBytes(processData.heapUsedBytes), 'JavaScript heap currently in use', 'accent'),
                renderCard('Cache Hit Rate', formatPercent(cache.hitRate), 'Raw get hit rate', cache.redisConnected ? 'ok' : 'warn'),
                renderCard('Lavalink Nodes', formatNumber(Array.isArray(lavalink.nodes) ? lavalink.nodes.length : 0), 'Connected node metadata seen by the bot', lavalink.ready ? 'ok' : 'warn')
            ].join('');
        }

        function renderSnapshot(data) {
            renderStatusSummary(data);
            renderOverview(data);

            healthChecks.innerHTML = renderHealthChecks(data.health && data.health.checks);
            cacheSummary.innerHTML = renderCache(data.cache);
            lavalinkSummary.innerHTML = renderLavalink(data.lavalink);
            discordSummary.innerHTML = renderKeyValues(data.discord);
            processSummary.innerHTML = renderKeyValues({
                pid: data.process && data.process.pid,
                node: data.process && data.process.node,
                platform: data.process && data.process.platform,
                arch: data.process && data.process.arch,
                hostname: data.process && data.process.hostname,
                processUptime: formatUptime(data.process && data.process.processUptimeSeconds),
                rss: formatBytes(data.process && data.process.rssBytes),
                heapUsed: formatBytes(data.process && data.process.heapUsedBytes),
                heapTotal: formatBytes(data.process && data.process.heapTotalBytes),
                external: formatBytes(data.process && data.process.externalBytes),
                arrayBuffers: formatBytes(data.process && data.process.arrayBuffersBytes),
                totalMemory: formatBytes(data.process && data.process.totalSystemMemoryBytes),
                freeMemory: formatBytes(data.process && data.process.freeSystemMemoryBytes),
                loadAverage: JSON.stringify(data.process && data.process.loadAverage),
                cpuUserMicros: formatNumber(data.process && data.process.cpuUserMicros),
                cpuSystemMicros: formatNumber(data.process && data.process.cpuSystemMicros)
            });
            circuitSummary.innerHTML = data.circuitBreakers ? jsonBlock(data.circuitBreakers) : emptyState('Circuit breaker registry is not attached.');
            degradationSummary.innerHTML = data.degradation ? jsonBlock(data.degradation) : emptyState('Graceful degradation state is not attached.');
            rawSnapshot.textContent = JSON.stringify(data, null, 2);
        }

        async function loadSnapshot() {
            fetchState.textContent = 'Refreshing';
            try {
                const response = await fetch('/dashboard.json', { cache: 'no-store' });
                const data = await response.json();
                fetchState.textContent = 'Last refresh OK';
                renderSnapshot(data);
            } catch (error) {
                fetchState.textContent = 'Refresh failed';
                refreshSummary.textContent = 'OFFLINE';
                statusRow.innerHTML = renderPill('Dashboard', 'unreachable', 'bad');
                rawSnapshot.textContent = String(error && error.message ? error.message : error);
            }
        }

        loadSnapshot();
        window.setInterval(loadSnapshot, REFRESH_MS);
    </script>
</body>
</html>`;
}

/**
 * Register a health check
 * @param name - Check name
 * @param checkFn - Async function returning { healthy: boolean, details?: object }
 */
export function registerHealthCheck(name: string, checkFn: () => Promise<HealthCheckResult>): void {
    healthChecks.set(name, checkFn);
    logger.debug('Health', `Registered health check: ${name}`);
}

/**
 * Run all health checks (in parallel)
 * @returns Health status
 */
export async function runHealthChecks(): Promise<HealthResponse> {
    const results: HealthResponse = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: Math.floor((Date.now() - healthState.startTime) / 1000),
        checks: {}
    };

    // Run all checks in parallel with individual timeouts
    const entries = [...healthChecks.entries()];
    const checkPromises = entries.map(async ([name, checkFn]): Promise<[string, HealthCheckEntry]> => {
        try {
            const startTime = Date.now();
            const result = await Promise.race([
                checkFn(),
                new Promise<never>((_, reject) => 
                    setTimeout(() => reject(new Error('Health check timeout')), 5000)
                )
            ]);
            
            return [name, {
                status: result.healthy ? 'healthy' : 'unhealthy',
                latency: Date.now() - startTime,
                ...result.details
            }];
        } catch (error) {
            return [name, {
                status: 'unhealthy',
                error: (error as Error).message
            }];
        }
    });

    const settled = await Promise.allSettled(checkPromises);
    
    for (const outcome of settled) {
        if (outcome.status === 'fulfilled') {
            const [name, entry] = outcome.value;
            results.checks[name] = entry;
            if (entry.status === 'unhealthy') {
                results.status = 'unhealthy';
            }
        }
    }

    healthState.checks = results.checks;
    healthState.status = results.status === 'healthy' ? 'healthy' : 'unhealthy';

    return results;
}

/**
 * Get current health status (cached, fast)
 * @returns Current health state
 */
export function getHealthStatus(): HealthResponse {
    return {
        status: healthState.status === 'healthy' ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        uptime: Math.floor((Date.now() - healthState.startTime) / 1000),
        checks: healthState.checks
    };
}

/**
 * Set the overall status
 * @param status - New status
 */
export function setStatus(status: HealthStatus): void {
    healthState.status = status;
}

/**
 * Start the health check HTTP server
 * @param port - Port to listen on (default: 3000)
 * @returns HTTP server instance
 */
export function startHealthServer(port: number = 3000): Server {
    const server = http.createServer(async (req: IncomingMessage, res: ServerResponse) => {
        const startedAt = Date.now();
        const method = req.method || 'GET';
        const path = getRequestPath(req);

        try {
            if (path === '/health' || path === '/healthz') {
                const health = await runHealthChecks();
                const statusCode = health.status === 'healthy' ? 200 : 503;
                sendResponse(res, method, path, startedAt, statusCode, JSON.stringify(health, null, 2), 'application/json');
                return;
            }

            if (path === '/ready' || path === '/readyz') {
                const status = healthState.status;
                const ready = status === 'healthy';
                sendResponse(res, method, path, startedAt, ready ? 200 : 503, JSON.stringify({ ready, status }), 'application/json');
                return;
            }

            if (path === '/live' || path === '/livez') {
                sendResponse(res, method, path, startedAt, 200, JSON.stringify({ alive: true }), 'application/json');
                return;
            }

            if (path === '/metrics') {
                const metrics = await getMetrics();
                sendResponse(res, method, path, startedAt, 200, metrics, getContentType());
                return;
            }

            if (path === '/' || path === '/dashboard') {
                sendResponse(res, method, path, startedAt, 200, buildDashboardHtml(), 'text/html; charset=utf-8');
                return;
            }

            if (path === '/dashboard.json' || path === '/stats') {
                const dashboard = await buildDashboardData();
                sendResponse(res, method, path, startedAt, 200, JSON.stringify(dashboard, null, 2), 'application/json');
                return;
            }

            sendResponse(res, method, path, startedAt, 404, JSON.stringify({ error: 'Not found' }), 'application/json');
        } catch (error) {
            const message = (error as Error).message;
            logger.error('Health', `Health server request failed for ${path}: ${message}`);
            sendResponse(res, method, path, startedAt, 500, JSON.stringify({ status: 'error', error: message }), 'application/json');
        }
    });

    server.listen(port, () => {
        logger.info('Health', `Health check server listening on port ${port}`);
    });

    server.on('error', (error: Error) => {
        logger.error('Health', `Health server error: ${error.message}`);
    });

    return server;
}

/**
 * Create default health checks for common services
 * @param services - Services to check
 */
export function registerDefaultChecks(services: ServiceConfig = {}): void {
    Object.assign(dashboardServices, services);

    // Discord client check
    if (services.client) {
        registerHealthCheck('discord', async () => {
            const client = services.client!;
            return {
                healthy: client.isReady(),
                details: {
                    ping: client.ws.ping,
                    guilds: client.guilds.cache.size,
                    uptime: client.uptime
                }
            };
        });
    }

    // PostgreSQL check
    if (services.database) {
        registerHealthCheck('postgres', async () => {
            try {
                await services.database!.query('SELECT 1');
                return { healthy: true, details: { connected: true } };
            } catch (error) {
                return { healthy: false, details: { error: (error as Error).message } };
            }
        });
    }

    // Redis check
    if (services.redis) {
        registerHealthCheck('redis', async () => {
            try {
                if (services.redis!.isConnected) {
                    await services.redis!.client.ping();
                    return { healthy: true, details: { connected: true } };
                }
                return { healthy: true, details: { connected: false, fallback: 'in-memory' } };
            } catch (error) {
                return { healthy: false, details: { error: (error as Error).message } };
            }
        });
    }

    // Cache service check (if provided)
    if (services.cacheService) {
        registerHealthCheck('cache', async () => {
            const stats = services.cacheService!.getStats();
            return {
                healthy: true,
                details: {
                    hitRate: Math.round(stats.hitRate * 100) + '%',
                    hits: stats.hits,
                    misses: stats.misses,
                    absenceChecks: stats.absenceChecks,
                    memoryEntries: stats.memoryEntries,
                    redisConnected: stats.redisConnected
                }
            };
        });
    }

    // Lavalink check
    if (services.lavalink) {
        registerHealthCheck('lavalink', async () => {
            const status = services.lavalink!.getNodeStatus?.() || {};
            // Consider healthy if ready OR if we have nodes (node might be connecting)
            const nodeCount = status.nodes?.length || 0;
            const isHealthy = status.ready === true || nodeCount > 0;
            return {
                healthy: isHealthy,
                details: {
                    ready: status.ready,
                    nodes: nodeCount,
                    players: status.activeConnections || 0
                }
            };
        });
    }

    // Circuit Breaker check
    if (services.circuitBreakerRegistry) {
        registerHealthCheck('circuitBreakers', async () => {
            const health = services.circuitBreakerRegistry!.getHealth();
            const summary = services.circuitBreakerRegistry!.getSummary();
            return {
                healthy: health.status !== 'unhealthy',
                details: {
                    status: health.status,
                    total: summary.total,
                    closed: summary.closed,
                    open: summary.open,
                    halfOpen: summary.halfOpen,
                    breakers: Object.fromEntries(
                        Object.entries(health.breakers).map(([name, b]) => [name, b.state])
                    )
                }
            };
        });
    }

    // Graceful Degradation check
    if (services.gracefulDegradation) {
        registerHealthCheck('degradation', async () => {
            const status = services.gracefulDegradation!.getStatus();
            return {
                healthy: status.level !== 'critical' && status.level !== 'offline',
                details: {
                    level: status.level,
                    services: status.services,
                    queuedWrites: status.queuedWrites ?? 0,
                    cacheEntries: status.cacheEntries ?? 0,
                }
            };
        });
    }
}



