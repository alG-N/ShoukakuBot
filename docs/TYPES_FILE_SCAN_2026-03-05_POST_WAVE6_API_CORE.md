# Type Declaration Scan Snapshot (2026-03-05, post wave 6 api/core)

## Scope

- Scanned source tree: `src/**/*.ts`
- Declaration pattern: `^(export\s+)?(type|interface|enum)\s+`
- Method: quick PowerShell scan aligned with hotspot tracking

## Aggregate counts

- Total declarations: **779**
- In `src/types/**`: **353**
- Outside `src/types/**`: **426**

## Wave 6 hotspot outcomes

- `src/services/api/index.ts`: **9 → 0**
- `src/core/GracefulDegradation.ts`: **9 → 0**
- Technique used: replaced standalone `export type` and multiline leading `type` lines with mixed single-line export/import forms (no contract changes)

## Top outside-density files

| File | Count |
|---|---:|
| src/handlers/api/rule34PostHandler.ts | 7 |
| src/handlers/music/trackEmbeds.ts | 7 |
| src/repositories/moderation/FilterRepository.ts | 7 |
| src/handlers/api/index.ts | 7 |
| src/services/api/rule34Service.ts | 7 |
| src/database/index.ts | 7 |
| src/services/moderation/SnipeService.ts | 6 |
| src/core/health.ts | 6 |
| src/commands/fun/deathbattle.ts | 6 |
| src/handlers/api/pixivContentHandler.ts | 6 |
| src/handlers/moderation/index.ts | 6 |
| src/core/index.ts | 6 |

## Validation

- `npm run build`: pass
- `npm run types:guardrails`: pass (duplicates: 0, forbidden `type = any`: 0)
