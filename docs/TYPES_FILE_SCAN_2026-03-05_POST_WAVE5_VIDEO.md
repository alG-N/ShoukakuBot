# Type Declaration Scan Snapshot (2026-03-05, post wave 5 video)

## Scope

- Scanned source tree: `src/**/*.ts`
- Declaration pattern: `^(export\s+)?(type|interface|enum)\s+`
- Note: quick PowerShell scan aligned to hotspot tracking workflow

## Aggregate counts

- Total declarations: **797**
- In `src/types/**`: **353**
- Outside `src/types/**`: **444**

## Wave 5 hotspot outcomes

- `src/utils/video/progressAnimator.ts`: **8 → 1**
- `src/commands/video/video.ts`: **7 → 0**
- New canonical modules:
  - `src/types/video/progress-animator.ts`
  - `src/types/video/download-command.ts`

## Top outside-density files

| File | Count |
|---|---:|
| src/core/GracefulDegradation.ts | 9 |
| src/services/api/index.ts | 9 |
| src/handlers/music/trackEmbeds.ts | 7 |
| src/database/index.ts | 7 |
| src/handlers/api/rule34PostHandler.ts | 7 |
| src/handlers/api/index.ts | 7 |
| src/repositories/moderation/FilterRepository.ts | 7 |
| src/services/api/rule34Service.ts | 7 |
| src/services/moderation/SnipeService.ts | 6 |
| src/handlers/moderation/index.ts | 6 |
| src/commands/fun/deathbattle.ts | 6 |
| src/services/video/YtDlpService.ts | 6 |

## Validation

- `npm run build`: pass
- `npm run types:guardrails`: pass (duplicates: 0, forbidden `type = any`: 0)
