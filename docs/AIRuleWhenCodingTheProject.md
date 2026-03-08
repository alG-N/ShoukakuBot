# AI Rules When Coding The Project

This document defines how AI must operate when editing code in the `shoukaku-backend` repo.
Goals: safety, correct scope, preserve architecture, and easy review.

## 1) Operating Mode

1. Always read context before editing: related files, flow, and impacts.
2. Prefer small, precise changes; avoid large refactors unless requested.
3. If the task is unclear, state clear assumptions in the output.
4. Do not guess logic without reading the actual code.
5. Every change must have a way to verify.

## 2) Scope Discipline

1. Only edit files within the scope allowed by the user.
2. Do not edit unrelated files just to match style.
3. Do not rename symbols/public APIs unless necessary.
4. Do not delete old code unless confirmed unused.

## 3) Architecture Rules (Repo-specific)

1. Command layer:
	- Only handle interaction, light input parsing, validation, and response.
	- Do not place heavy business logic in command files.

2. Service layer:
	- Contains main business logic.
	- Avoid importing from handler/presentation layer.

3. State and cache:
	- If state may be cross-shard, prefer Redis/`CacheService`.
	- Limit in-memory `Map/Set` for state needing synchronization.

4. Data access:
	- Prefer clear repository/service boundaries.
	- Avoid direct SQL queries that bypass existing abstractions.

## 4) Type Safety Rules

1. Do not create `type X = any` or use `as any` unless no safer option exists.
2. Prefer `unknown` + type guards for data from external APIs.
3. If a type is used in many places, move it to `src/types/`.
4. Use `import type` for type-only imports.

## 5) Reliability and Safety Rules

1. Do not hardcode tokens, secrets, keys, or sensitive IDs.
2. Do not log credentials.
3. Catch errors at boundaries (API calls, DB calls, interaction updates).
4. If retry/backoff logic exists, keep handling consistent.
5. If changing moderation/music behavior, clearly state regression risks.

## 6) Testing and Validation Rules

1. After editing, prioritize running:
	- `npm run build`
	- Tests related to the module just changed

2. If tests cannot be run:
	- State the reason.
	- Provide a minimum manual verification checklist.

3. When fixing bugs:
	- Add or update tests to protect against regression.

## 7) Comment and Style Rules

1. Comment only to explain "why", trade-offs, or edge cases.
2. Do not write comments describing obvious code.
3. Name variables/functions clearly, prefer descriptive intent.
4. Keep coding style consistent with the current file.

## 8) Performance Rules

1. Pay attention to large files and hot paths (music playback, API services, handlers).
2. Avoid creating small objects/regex inside loops unless necessary.
3. If adding cache, it must have a limiting policy (size/TTL).

## 9) Required Output Format For AI

Every time a task is completed, AI should respond in this order:

1. Root cause / objective addressed.
2. List of files changed.
3. Summary of main changes.
4. Remaining risks (if any).
5. Commands run and summary of results.

## 10) Definition of Done

A task is considered done when:

1. Changes are within scope.
2. Business requirements are met.
3. Related build/tests pass or reason for not running is stated.
4. No architectural changes beyond expectations.
5. Reviewer has enough information to verify quickly.

## 11) Quick Prompt To Enforce These Rules

```md
Code according to docs/AIRuleWhenCodingTheProject.md.

Task:
	- <describe task>

Allowed files:
	- <file 1>
	- <file 2>

Do not touch:
	- <file/folder>

Validation required:
	- npm run build
	- npm test -- <pattern>
	- Restart the bot and verify behavior manually if needed.

Output required:
1) Root cause
2) Changed files
3) Risks
4) Commands run + summary
```
