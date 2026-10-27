# Deployment, security, retention, and recovery

## Deployment status

Compose is supplied for development/self-host evaluation. Docker builds and live PostgreSQL are CI/deployment checks, not claimed as locally verified in the constrained development sandbox. Do not expose the current release as a public paid multi-tenant service without the hardening below.

Use persistent machines/containers for FastAPI and the worker; FFmpeg cannot run reliably in an ephemeral frontend function. The frontend can deploy separately, but `API_URL` is embedded in rewrites at **build time**. Use a private backend URL reachable by the frontend server and route browser `/api/*` through it. Production API OpenAPI endpoints can be gated at your reverse proxy.

## Environment

| Variable | Purpose |
| --- | --- |
| DATABASE_URL | SQLAlchemy PostgreSQL URL; SQLite file default for native dev |
| STORAGE_PATH | Absolute shared private media directory; same mount for API and worker |
| PUBLIC_ORIGIN | Exact externally visible browser origin for cookie CSRF checks; comma-separated development origins |
| COOKIE_SECURE | Set `true` on HTTPS; defaults false only for local HTTP |
| UPLOAD_LIMIT_MB | Streaming upload limit, 100 by default; frontend proxy limit currently also 100 MB |
| OLLAMA_URL / OLLAMA_MODEL | Optional operator-controlled text server and installed model ID, configured on API AND worker |
| API_URL | Frontend-server-to-backend URL; default native development `http://127.0.0.1:8000` |
| POSTGRES_PASSWORD | Compose database credential; change the placeholder and matching DATABASE_URL |

Neither provider URLs nor credentials are accepted from untrusted browser requests. No commercial provider or publishing credentials are currently consumed. Configure network access to Ollama deliberately; a Docker container's `localhost` is not the host machine.

## Production checklist

- TLS, `COOKIE_SECURE=true`, exact `PUBLIC_ORIGIN`, private API/DB, reverse proxy body/rate/connection limits and CSRF header preservation. Do not trust arbitrary forwarded headers. The supplied in-memory limiter is per API process and insufficient for distributed deployments.
- Replace development passwords. Use a secret manager; never commit `.env`. Restrict DB roles and encrypt volumes/backups. No secrets in `NEXT_PUBLIC_*` variables.
- Install current FFmpeg security updates; run media processes nonroot in sandboxed containers, deny external network to media workers (allow only DB/configured provider as necessary), impose CPU/memory/PID/disk/time quotas. Uploaded media is hostile input even when valid.
- Application limits: 100 MB file default, max 40M image pixels, 100 scenes, 20-minute render timeline, three active workspace jobs. Add durable workspace storage/daily-budget limits before broad public signup. Registration currently has no email verification or password recovery.
- Use PostgreSQL for multiple workers. Monitor queue age, failures, disk usage, API readiness, process/container liveness. Current logging includes generated request IDs and safe job error categories; there is no complete metrics/worker heartbeat stack yet.
- Keep session/access logs private; default Uvicorn access logging is disabled to avoid logging query details. Revoke API keys when compromised; logout revokes the current session. An all-device session revocation UI remains future work.
- Keep database/media snapshots consistent. No S3, signed public sharing, payments, publishing, or public archive extraction is implemented.

## Backups

Stop writes/worker processing for a consistent initial backup, then dump PostgreSQL and snapshot the media volume:

```bash
docker compose stop api worker web
docker compose exec -T db pg_dump -U openreel -Fc openreel > openreel.dump
# Back up the Docker "media" volume using your volume backup tool.
docker compose start api worker web
```

Restore into an empty database with `pg_restore -U openreel -d openreel --clean --if-exists`, restore the media volume from the same snapshot, run migrations, then restart API/worker. Test restoration regularly. For native SQLite, stop both processes and copy the DB and media directory together. Dumps/archives contain private content; encrypt and restrict them.

## Retention

There is no automatic deletion/retention scheduler yet. Project deletion removes scenes/jobs but retains media for reuse. Storage totals include outputs. Operators must establish a retention policy; never delete referenced asset UUID files blindly. After stopping workers and checking no active jobs, old `render-*` scratch directories left by hard termination can be removed. Reconcile DB asset references before removing orphan UUID files. A managed cleanup/asset deletion workflow is future work.

## Troubleshooting

- Upload 422: file is invalid, too large in dimensions, unsupported, or ffprobe missing; filenames/MIME do not override inspection.
- Upload proxy 413: reverse proxy/Next body limit; align it with API limit.
- CSRF 403: ensure browser origin matches `PUBLIC_ORIGIN`; clients using cookies must send `X-OpenReel-Client: 1`.
- Queued forever: worker absent, different DB path/env, or disabled process. Start worker in the same native working directory as API.
- Failed render: check source existence, disk space, FFmpeg libx264/libass support, fonts, and safe worker logs. Fix source/install issues then Retry (max three attempts).
- Crash recovery: wait until the 15-minute lease expires. Do not reset a live job's status; two workers could otherwise produce duplicate outputs.
- Stale edit 409: reopen the project before saving. Local unsaved controls are not automatically merged.
- No model: install it yourself and set identical Ollama environment on API/worker. No automatic substitutions or downloads.
