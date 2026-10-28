# OpenReel AI

**Create, edit, render, and publish videos with AI — using open-source tools, local models, and the AI providers you choose.**

OpenReel's first release is a **working self-hosted media studio**, not the completed ten-milestone platform. It prioritizes creating real videos from your own media without paid AI services. Publishing is a roadmap goal, not an enabled feature.

## Working today

- Next.js App Router / React / strict TypeScript interface, dark/light themes, responsive navigation, real-data dashboard, useful empty states.
- FastAPI, SQLAlchemy, explicit Alembic migrations; PostgreSQL in Docker, SQLite for lightweight development.
- Registration, Argon2id passwords, hashed seven-day session tokens, HttpOnly cookies, logout/revocation, CSRF checks, personal workspace isolation.
- Project create/read/update/delete; optimistic version checks on project and scene edits; portable storyboard JSON export.
- Upload images, video, and audio; inspect with Pillow and ffprobe, enforce file limits, restrict FFmpeg input demuxers/protocols, private UUID storage keys.
- Scene-based editor: media selection, caption editing, ordering, duration, paragraph-to-scene planning without rewriting supplied text, persisted explicit saves.
- 9:16, 16:9, 1:1 renders at 720×1280 / 1280×720 / 720×720, 24 fps. Output dimensions **do not imply native source quality**.
- Dedicated durable DB worker, transactional claiming, PostgreSQL `SKIP LOCKED`, bounded attempts/timeouts, lease-based crash recovery, cancellation checkpoints, immutable render snapshots.
- Real FFmpeg H.264 MP4 rendering, image slideshows and clip assembly, deterministic segment-timed ASS captions, background audio looping/dynamic normalization/volume, ffprobe output validation.
- Authorized range-capable preview/download, visible job failures and retries, actual storage and completed-render metrics; unknown compute cost stays unknown.
- Optional **queued** Ollama script drafting with an operator-configured installed model. No model downloads, fake provider results, or paid API requirements.
- Revocable hashed API keys, versioned REST API/OpenAPI, TypeScript and Python clients, authenticated stdio MCP server (five implemented tools).
- Unit/integration tests, real media test, optional browser smoke, CI, Docker Compose.

## Quick start: Docker

Prerequisites: Docker Engine + Compose v2, at least 4 GB RAM and space for media.

```bash
cp .env.example .env
# Set POSTGRES_PASSWORD and the matching password inside DATABASE_URL.
docker compose up --build
```

Open **http://localhost:3000**, register, and create a project. Compose runs migrations as a separate one-shot service before API/worker startup. PostgreSQL and media use persistent volumes. No Redis or AI credentials required. `docker compose down` retains volumes; `down -v` destroys data.

### Make your first real video

1. Create a project and choose an aspect ratio.
2. Upload your own image/clip and, optionally, background audio in the editor or Asset library.
3. Add scenes. Choose each scene's media, duration, caption text, and order; click **Save scene**.
4. Choose background audio/volume in project settings. Save settings.
5. Click **Render MP4**. Keep the worker running; HTTP requests do not run renders themselves.
6. Review **Latest finished render**, play it, or download the MP4.

The scene preview is not a full synchronized multitrack playback engine. Source clip audio is deliberately muted; uploaded background audio is the final soundtrack. Captions use scene timings, not speech alignment. No narration is synthesized automatically.

## Native development

Prerequisites: Node 22+, Python 3.11+, FFmpeg + ffprobe with libx264/libass and DejaVu Sans installed on your OS. On Debian/Ubuntu: `sudo apt-get install ffmpeg fonts-dejavu-core python3-venv`.

From the repository root:

```bash
python -m venv .venv
. .venv/bin/activate
pip install -r apps/api/requirements.txt
npm ci
cd apps/api
alembic upgrade head
PUBLIC_ORIGIN=http://localhost:3000 uvicorn openreel.main:app --host 0.0.0.0 --port 8000 --no-access-log
```

Second terminal, from the repository root:

```bash
. .venv/bin/activate
cd apps/api
python -m openreel.worker
```

Third terminal, from the repository root:

```bash
npm run dev
```

Default DB is `apps/api/openreel.db`; default media is `apps/api/storage/`. API and worker **must use the same working directory/environment**. Set `DATABASE_URL=postgresql+psycopg://...` on both for PostgreSQL. Run only one worker with SQLite. Local `.env` is **not** automatically loaded in native mode; export variables explicitly. The web server proxies `/api/*` to the backend; browser code never calls localhost for a separate service.

- API OpenAPI UI: http://localhost:8000/docs
- Liveness: `/health`; DB/schema/FFmpeg readiness: `/ready`
- Configure `PUBLIC_ORIGIN` to the exact browser-facing origin; comma-separated origins are supported for development.
- For public HTTPS, set `COOKIE_SECURE=true` and a correct `PUBLIC_ORIGIN`.

## Optional local script provider

Install and run Ollama separately. Choose a model you have reviewed and installed, then export on **both API and worker**:

```bash
export OLLAMA_URL=http://your-ollama-host:11434
export OLLAMA_MODEL=your-installed-model-id
```

Restart both processes. In **AI models**, select a project, enter a topic, and request a draft. The API queues a job; worker results appear below the form. Review claims before copying the draft into your project. Provider timeout is 90 seconds; failed requests remain failed and can be explicitly retried. `configured` means environment configuration exists, not a successful live model health check. Availability is confirmed by the actual request. Model weights/licenses, hardware, and commercial rights depend on your chosen model; nothing is silently downloaded/substituted.

## Developer tools

Create an API key in the UI. It is displayed once, stored hashed, and can be revoked. Never put it in browser code. See [developer guide](docs/developer-platform.md) for working SDK and MCP examples.

```bash
curl -H "Authorization: Bearer $OPENREEL_API_KEY" http://localhost:8000/api/v1/projects
```

## Verification

With FFmpeg on PATH, from the repository root:

```bash
. .venv/bin/activate
pip install -e packages/python-sdk -e packages/mcp-server
pip check
ruff check apps/api packages/python-sdk packages/mcp-server tests
PYTHONPATH=apps/api pytest -q apps/api/tests tests
npm run lint
npm run typecheck
npm run test:sdk
npm run build
npm audit --omit=dev --audit-level=high
```

Backend tests use an isolated temporary database and media directory, run migrations up/down, and need no model credentials. To test PostgreSQL, set `TEST_DATABASE_URL` to a **dedicated empty disposable DB**. Tests destroy their schema. CI covers SQLite and PostgreSQL. [Verification notes](docs/verification.md) distinguish locally executed checks from pending CI/production checks.

## Scope and limitations

This is **not yet production-ready hosted SaaS** and does not satisfy every acceptance criterion in the master roadmap. No email verification/password reset/OAuth, team invitation or role-management UI, admin console, subscriptions/payments, budget ledger, S3/R2, signed sharing links, retention scheduler, generative images/video, TTS/transcription, research agent, templates, social publishing, automation scheduler, webhooks/SSE, multitrack timeline, autosave, undo/redo, or scene version history. Version counters detect conflicts but do not retain prior revisions. Projects default to the user's personal workspace; multi-workspace switching is not implemented. Nonimplemented endpoints do not return fake success.

The current renderer restarts a failed render from its immutable snapshot; it does not reuse partial scene encodes after a crash. Completed input assets/scenes remain intact. Cancellation takes effect between FFmpeg commands (each bounded); it is not immediate process termination. A worker crash is reclaimed after a 15-minute lease, up to three attempts. No worker heartbeat endpoint yet. The in-process rate limiter is a development guard; production needs a shared edge limiter. Local compute costs are unknown and no monetary budget enforcement is claimed.

Read [architecture](docs/architecture.md), [deployment/security/backup guide](docs/deployment.md), and [roadmap](docs/roadmap.md). Original implementation/branding; no AITuber code, assets, or affiliation.
