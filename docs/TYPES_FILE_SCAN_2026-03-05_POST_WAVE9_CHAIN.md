# Type Declaration Scan Snapshot (2026-03-05, post waves 7-9 chain)

## Scope

- Scanned source tree: `src/**/*.ts`
- Declaration pattern: `^(export\s+)?(type|interface|enum)\s+`
- Method: quick PowerShell scan aligned with hotspot tracking

## Aggregate counts

- Total declarations: **764**
- In `src/types/**`: **359**
- Outside `src/types/**`: **405**

## Wave outcomes

- Wave 7 (`rule34PostHandler` contracts): moved handler-local contracts to `src/types/api/rule34-post-handler.ts`
- Wave 8 (`trackEmbeds`): flattened multiline type imports to mixed single-line import
- Wave 9 (`handlers/api/index`): replaced standalone `export type` blocks with mixed value+type re-exports

## Top outside-density files

| File | Count |
|---|---:|
| src/database/index.ts | 7 |
| src/repositories/moderation/FilterRepository.ts | 7 |
| src/services/api/rule34Service.ts | 7 |
| src/commands/fun/deathbattle.ts | 6 |
| src/cache/music/VoteCache.ts | 6 |
| src/services/music/core/LavalinkService.ts | 6 |
| src/services/moderation/SnipeService.ts | 6 |
| src/services/music/index.ts | 6 |
| src/core/health.ts | 6 |
| src/services/music/spotify/SpotifyService.ts | 6 |
| src/handlers/api/pixivContentHandler.ts | 6 |
| src/core/index.ts | 6 |

## Validation

- `npm run build`: pass
- `npm run types:guardrails`: pass (duplicates: 0, forbidden `type = any`: 0)
