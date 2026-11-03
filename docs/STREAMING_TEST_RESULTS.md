# Streaming test results

## 2026-11-01

- Baseline `pnpm test`: shared 19, API 77 and web 66 unit tests passed before these changes.
- TV metadata and Watchmode adapter tests: 4 passed, all upstream responses mocked. Tests cover original-name search, episode availability, input validation, region filtering, safe links and header authentication.
- `test/series.int.test.ts`: 5 passed against isolated Postgres/Redis, including disabled provider and invalid-region behavior.
- `tests/e2e/tv-discovery.spec.ts`: 1 passed against a production-built isolated stack. Provider and TV responses were mocked; this is UI evidence, not evidence of live Money Heist discovery or viewing.
- `pnpm typecheck` and `pnpm lint` passed after adapter changes. Production builds completed as part of the browser stack.
- Big Buck Bunny previously played locally; the full requested end-to-end acceptance including complete playback, audio, failover, recovery and history has not been run.
