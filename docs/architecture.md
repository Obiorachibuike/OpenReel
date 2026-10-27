# Architecture and initial audit

## Audit (2026-10-27)

The starting commit contained only `README.md` with `# OpenReel`. There were no manifests, application routes, database schemas/migrations, auth, providers, tests, deployment configs, or existing functional features to preserve. This justified an initial monorepo rather than replacing an existing stack.

## Components

- `apps/web`: Next.js 16 App Router, React 19, strict TypeScript, Tailwind 4, original custom UI primitives, Lucide. Fetch adapter and domain types live in `lib/api.ts`; server-side rewrites proxy the API. No browser-delivered credentials. No shadcn, Query, or form dependencies were needed for this focused first version.
- `apps/api/openreel`: FastAPI route validation/auth; SQLAlchemy records; Pillow/FFprobe inspection; a separate media engine and text-provider protocol. Passwords use Argon2id, sessions/API keys use SHA-256 token digests. Workspace membership gates record lookup and downloads.
- `apps/api/migrations`: frozen initial schema and scene-version migration. No schema creation at server startup.
- `openreel.worker`: dedicated durable worker (in the API package to share models/service code, deployed as its own process/container). Render/script submission inserts a job transactionally. There is no external broker to coordinate, so no separate outbox is necessary yet.
- `packages`: small TypeScript SDK, Python SDK, real stdio MCP server.

## Queue semantics

Submission validates scene count, duration, asset references, and workspace active-job limit. Workspace row locking serializes queue admission on PostgreSQL. Workers claim queued or expired running jobs under row locks with `SKIP LOCKED`, increment attempts, and establish a 15-minute lease. Progress changes only at actual scene/assembly/validation checkpoints. Queue polling interval is two seconds. UI polls persisted jobs every four seconds; no fake progress timers.

Each render stores a snapshot of media keys, caption text, durations, aspect ratio, and audio settings. Edits do not mutate already-queued work. Each scene encodes independently inside a temporary job directory; assembly applies ASS captions and background audio. Final output is probed before the asset record and completed state commit together. Temporary scene files clean up on normal failure; hard kill can leave orphan scratch directories requiring operator cleanup. Filesystem and DB are not one distributed transaction: monitor/reconcile orphan outputs after a crash.

Cancellation is checked between commands and before committing the result. Retry reuses the snapshot, not a new edited timeline. Missing inputs fail visibly. No remote provider success is invented.

## Media safety

Storage uses generated UUIDs and strict single-root resolution. Uploaded names never become paths or shell arguments. No shell execution is used. FFmpeg uses argument arrays, a local-file protocol allowlist, demuxer allowlist, bounded subprocess timeouts, and limited threads. Playlist formats are refused. Image verification and pixel bounds precede processing. These are defense in depth, **not** a complete media sandbox. Deploy workers with network denial and resource quotas.

## Deliberate compromises

SQLite supports the local path only; multiple workers/concurrent admission must use PostgreSQL. Explicit saves are intentional; scene/project version checks return 409 on stale updates. Frontend navigation is an app-state workspace, not deep-link routes. Output is fixed to a modest 24fps/720p preset for reliable CPU rendering; no 4K claims. The dashboard counts database records; it does not show fake social metrics or budgets. Source clip audio is removed rather than implicitly mixed; background audio has a conservative default gain and dynamic normalization, not a narration-ducking engine.
