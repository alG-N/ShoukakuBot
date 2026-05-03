export const dashboardClientScript = `
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
`;