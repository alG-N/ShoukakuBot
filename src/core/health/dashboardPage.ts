/**
 * Health Dashboard Page
 * HTML, CSS, and browser-side rendering for the live dashboard UI.
 * @module core/health/dashboardPage
 */

import { dashboardClientScript } from './dashboardClient.js';
import { dashboardStyles } from './dashboardStyles.js';

const dashboardBody = `
    <div class="shell">
        <header class="page-header">
            <section class="header-main">
                <h1>Shoukaku Health Dashboard</h1>
                <p class="subline">A simple runtime view for bot health, service status, and diagnostic endpoints on port 3000.</p>
                <div class="link-row">
                    <a class="link-pill" href="/health" target="_blank" rel="noreferrer">/health</a>
                    <a class="link-pill" href="/metrics" target="_blank" rel="noreferrer">/metrics</a>
                    <a class="link-pill" href="/dashboard.json" target="_blank" rel="noreferrer">/dashboard.json</a>
                    <a class="link-pill" href="http://localhost:3030" target="_blank" rel="noreferrer">Grafana :3030</a>
                </div>
            </section>
            <aside class="header-side">
                <div class="status-row" id="statusRow"></div>
                <div class="meta-row">
                    <span class="pill info" id="lifecycleBadge">Lifecycle: starting</span>
                    <span class="pill info" id="overallBadge">Health: unknown</span>
                    <span class="pill info">Auto-refresh 10m</span>
                    <span class="pill info" id="snapshotAt">Waiting for first snapshot</span>
                    <span class="pill info" id="fetchState">Connecting</span>
                </div>
                <p class="hint" id="refreshSummary">Waiting for first snapshot.</p>
            </aside>
        </header>

        <section class="overview-grid" id="overviewGrid"></section>

        <section class="grid">
            <article class="panel span-12">
                <h2>Health Checks</h2>
                <div class="checks" id="healthChecks"></div>
            </article>

            <article class="panel span-6">
                <h2>Cache</h2>
                <div id="cacheSummary"></div>
            </article>

            <article class="panel span-6">
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

        <div class="footer-note">Dashboard refreshes automatically every 10 minutes.</div>
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

