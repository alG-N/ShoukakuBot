export const dashboardStyles = `
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
`;