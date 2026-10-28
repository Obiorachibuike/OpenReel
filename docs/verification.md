# Verification report — 2026-10-27

## Executed in the development sandbox

| Check | Result |
| --- | --- |
| Frontend ESLint | PASS, zero warnings/errors |
| Web + TypeScript SDK `tsc --noEmit` | PASS, strict TypeScript |
| Next.js production build | PASS |
| Python Ruff (configured E/F/I/UP/B rules) | PASS |
| Backend + media + migrations + Python SDK + MCP pytest | **14 passed**, no paid API credentials |
| TypeScript SDK Node tests | **3 passed** |
| Alembic upgrade / downgrade | PASS against isolated SQLite; native preview upgraded to head |
| Python dependency consistency (`pip check`) | PASS |
| Python security audit (`pip-audit`) | PASS, no known vulnerabilities; unpublished local SDK/MCP packages are skipped by the public database |
| Production npm dependency audit | PASS, zero reported vulnerabilities |
| Chromium browser smoke | PASS, no page errors |
| Dark desktop/light mobile screenshots | Captured during smoke; desktop visual reviewed |

The browser smoke exercises registration, project creation, saved script, paragraph-to-scene creation, real image upload, persisted media/duration/caption edits, queued worker rendering, finished preview/download availability, all navigation destinations, theme toggle, and mobile viewport. The backend integration test independently downloads and ffprobes the real output, verifying video+audio streams, dimensions, duration, and preserving source scene records. It uses ASS caption rendering, not simulated media.

Other tests cover invalid media and playlist rejection, input validation, unauthorized requests, login/logout, origin rejection, API key revocation, cross-account project/scene/media denial, stale project/scene saves, project JSON export/delete, missing input failure, retry/cancellation, expired worker lease recovery, unconfigured provider errors, mocked queued provider completion, malformed provider responses, and MCP registration/API delegation.

## Failures encountered and corrected

- Initial missing workspace SDK package manifest: created the real package and tests.
- Initial migration test config path was relative to the wrong directory: resolved config/script paths explicitly.
- Initial Python dependency pins had security advisories/incompatibilities: upgraded to compatible current releases, migrated MCP to `MCPServer` v2, pinned tested versions, reran audit/tests.
- Real audio render exposed FFmpeg filter threading/silent-loudnorm issues: bounded filter threading, switched soundtrack normalization to dynaudnorm; real media test now passes quickly.
- A corrupt PNG browser fixture exposed an uncaught Pillow SyntaxError: added safe 422 handling and used a valid original fixture.
- Ruff's updated defaults needed explicit project rules and FastAPI dependency exceptions; configured the rules and fixed remaining findings.

## Not verified / not claimed

- Docker image builds, Compose startup, live PostgreSQL migrations/locking, or real Ollama generation were not executed locally. Docker/PostgreSQL are not installed in this sandbox. CI includes PostgreSQL and SQLite jobs; check the PR's actual results separately.
- No Python static type checker is configured. Pydantic validation and Python tests are not advertised as static type-check coverage.
- No load/chaos/penetration test, distributed rate limiter, media sandbox proof, production deployment, or full acceptance of all roadmap features.
- No publishing/payment/image/video/TTS integration tests: those integrations are not implemented.

## Optional browser smoke reproduction

Run API, worker, and web as documented. Install test-only browser tools outside tracked dependencies:

```bash
mkdir -p .local/browser
npm install --prefix .local/browser playwright-core @sparticuz/chromium
NODE_PATH="$PWD/.local/browser/node_modules" node tests/browser-smoke.cjs
```

On a normal Linux machine with a browser already installed, install only playwright-core and set `CHROMIUM_PATH=/usr/bin/chromium`. The sandbox needed bundled Chromium's extra NSS libraries extracted from its `al2023.tar.br`; this is environment-specific, not an application runtime dependency. Screenshots go to ignored `.local/`. The smoke creates a new private test account/project and uses the running worker; never point it at a production workspace.
