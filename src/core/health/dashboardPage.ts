/**
 * Health Dashboard Page
 * HTML, CSS, and browser-side rendering for the live dashboard UI.
 * @module core/health/dashboardPage
 */

import { dashboardClientScript } from './dashboardClient.js';
import { dashboardStyles } from './dashboardStyles.js';

const dashboardBody = `
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
`;

export function buildDashboardHtml(): string {
    return `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Shoukaku Live Dashboard</title>
    <style>
${dashboardStyles}
    </style>
</head>
<body>
${dashboardBody}

    <script>
${dashboardClientScript}
    </script>
</body>
</html>`;
}

