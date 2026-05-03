export const dashboardStyles = `
:root {
    color-scheme: dark;
    --bg: #0b1220;
    --panel: #111a2b;
    --panel-strong: #0f1828;
    --line: #24344a;
    --text: #e6edf7;
    --muted: #9fb0c6;
    --ok: #4ade80;
    --warn: #fbbf24;
    --bad: #f87171;
    --info: #60a5fa;
    --accent: #f59e0b;
    font-family: "Segoe UI", system-ui, sans-serif;
}

* { box-sizing: border-box; }

body {
    margin: 0;
    min-height: 100vh;
    background: var(--bg);
    color: var(--text);
}

a {
    color: inherit;
    text-decoration: none;
}

.shell {
    width: min(1380px, calc(100vw - 32px));
    margin: 0 auto;
    padding: 24px 0 32px;
}

.page-header,
.panel,
.card {
    border: 1px solid var(--line);
    background: var(--panel);
    border-radius: 14px;
}

.page-header {
    display: grid;
    gap: 18px;
    margin-bottom: 16px;
    padding: 20px;
}

.header-main h1 {
    margin: 0;
    font-size: clamp(1.8rem, 4vw, 2.6rem);
    line-height: 1.1;
}

.subline,
.hint,
.caption,
.meta {
    color: var(--muted);
}

.subline {
    margin: 8px 0 0;
    font-size: 0.98rem;
    line-height: 1.5;
    max-width: 72ch;
}

.hint {
    margin: 12px 0 0;
    line-height: 1.5;
}

.status-row,
.link-row,
.meta-row,
.pill-row {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
}

.status-row { margin-top: 0; }
.link-row { margin-top: 16px; }
.meta-row { margin-top: 12px; }

.pill,
.link-pill {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    border-radius: 999px;
    border: 1px solid var(--line);
    padding: 7px 11px;
    font-size: 0.9rem;
    background: var(--panel-strong);
}

.pill.ok { border-color: rgba(74, 222, 128, 0.35); color: var(--ok); }
.pill.warn { border-color: rgba(251, 191, 36, 0.35); color: var(--warn); }
.pill.bad { border-color: rgba(248, 113, 113, 0.35); color: var(--bad); }
.pill.info { color: var(--info); }

.link-pill:hover {
    border-color: #3b4d66;
}

.overview-grid {
    display: grid;
    gap: 12px;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    align-items: start;
    margin-bottom: 16px;
}

.card {
    padding: 16px;
    min-height: 0;
}

.card-label {
    color: var(--muted);
    font-size: 0.82rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
}

.card-value {
    margin-top: 12px;
    font-size: clamp(1.3rem, 2.6vw, 2rem);
    font-weight: 700;
    line-height: 1.15;
    word-break: break-word;
}

.card-note {
    margin-top: 8px;
    color: var(--muted);
    font-size: 0.9rem;
    line-height: 1.4;
}

.grid {
    display: grid;
    gap: 16px;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    align-items: start;
}

.panel {
    padding: 18px;
    min-width: 0;
}

.panel h2 {
    margin: 0 0 14px;
    font-size: 0.95rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--muted);
}

.span-4 { grid-column: span 4; }
.span-6 { grid-column: span 6; }
.span-8 { grid-column: span 8; }
.span-12 { grid-column: span 12; }

.checks,
.list {
    display: grid;
    gap: 12px;
}

.checks {
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
}

.check {
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 12px;
    background: var(--panel-strong);
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
    gap: 6px;
    font-size: 0.9rem;
    color: var(--muted);
}

.kv {
    display: grid;
    border: 1px solid var(--line);
    border-radius: 12px;
    overflow: hidden;
    background: var(--panel-strong);
}

.kv-row {
    display: grid;
    grid-template-columns: minmax(120px, 180px) 1fr;
    gap: 12px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--line);
}

.kv-row:last-child {
    border-bottom: 0;
}

.kv-key {
    color: var(--muted);
    text-transform: capitalize;
    font-weight: 600;
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
    background: var(--panel-strong);
    border: 1px solid var(--line);
    font-size: 0.88rem;
}

pre {
    margin: 0;
    padding: 14px;
    border-radius: 12px;
    background: #0a1321;
    border: 1px solid var(--line);
    color: #dbe8f7;
    overflow: auto;
    font: 0.84rem/1.55 "Cascadia Code", Consolas, monospace;
    max-height: 360px;
}

.empty {
    padding: 18px;
    border-radius: 12px;
    border: 1px dashed #38506d;
    color: var(--muted);
    text-align: center;
}

.footer-note {
    margin-top: 16px;
    font-size: 0.9rem;
    color: var(--muted);
}

@media (min-width: 1100px) {
    .page-header {
        grid-template-columns: minmax(0, 1.5fr) minmax(320px, 1fr);
        align-items: start;
    }
}

@media (max-width: 1080px) {
    .span-4, .span-6, .span-8, .span-12 { grid-column: span 12; }
}

@media (max-width: 720px) {
    .shell { width: min(100vw - 20px, 1380px); padding-top: 16px; }
    .page-header, .panel, .card { border-radius: 12px; }
    .kv-row { grid-template-columns: 1fr; gap: 4px; }
    .checks { grid-template-columns: 1fr; }
}
`;