# REST API, SDKs, MCP

The authoritative route/request schemas are FastAPI `/docs` and `/openapi.json`. All feature routes use `/api/v1`. Errors are `{"error":{"code":"...","message":"..."}}`; validation includes safe field messages without echoing private input. Response header `X-Request-ID` correlates completed requests with logs. Project lists support `limit` (1–100) and `offset`; asset/job lists currently cap at 200/100.

Implemented routes include auth register/login/logout, me/workspaces (list), project CRUD/export, scene list/add/edit/delete, asset upload/list/authorized download, render submission, job list/get/cancel/retry, usage, provider discovery, script drafting, and API key create/list/revoke. Other roadmap routes are not implemented and do not report success. Cookie writes require `X-OpenReel-Client: 1`; server-side SDKs use bearer keys instead.

`POST /scripts/generate?project_id=...` accepts `{"topic":"..."}` and returns a queued script job (202), not generated text. Completed jobs expose `output.script`; the user must approve/copy it into the project. Render jobs expose `result_id` when validated. No SSE/webhooks or automatic POST retries/idempotency keys yet: callers should retain returned job IDs and avoid blindly resubmitting timed-out writes.

## TypeScript

```bash
npm run build -w packages/typescript-sdk
```

The package is ready for local packaging (`npm pack -w packages/typescript-sdk`), not published to a registry.

```ts
import {OpenReelClient} from '@openreel/sdk';
import {readFile} from 'node:fs/promises';
const client = new OpenReelClient({
  apiKey: process.env.OPENREEL_API_KEY!,
  baseUrl: 'http://localhost:8000',
});
const project = await client.projects.create({title: 'Ocean', ratio: '16:9'});
const asset = await client.assets.upload(new Blob([await readFile('./frame.png')]), 'frame.png');
await client.scenes.create(project.id, {asset_id: asset.id, duration: 5, narration: 'The ocean connects us.'});
const job = await client.renders.create(project.id);
const done = await client.jobs.waitForCompletion(job.id);
const mp4 = await client.assets.download(done.result_id!);
```

Methods include projects create/list/get, scenes create/list/update (update needs the current `version`), renders create, jobs get/cancel/retry/waitForCompletion, assets upload/download, usage/providers, and a low-level typed `request`. Errors are `OpenReelError` with HTTP status. Requests have bounded timeouts; polling has an overall deadline. There are no imaginary `videos.generate` methods for absent providers. Automatic transport retries are deliberately not enabled for non-idempotent writes.

## Python

```bash
pip install -e packages/python-sdk
```

```python
import os
from openreel_sdk import OpenReelClient
client = OpenReelClient(os.environ['OPENREEL_API_KEY'])
try:
    project = client.create_project('Ocean', ratio='16:9')
    image = client.upload('./frame.png')
    client.add_scene(project.id, asset_id=image['id'], duration=5, narration='The ocean connects us.')
    job = client.render(project.id)
    done = client.wait_for_completion(job.id)
    client.download(done.result_id, './ocean.mp4')
finally:
    client.close()
```

Pydantic project/job responses and `OpenReelError` are provided. HTTP timeouts and polling deadlines are bounded. Additional backend routes are available through `request`. Streaming file downloads are supported, not SSE. SDK method parity, comprehensive typed scene/usage models, and retry/idempotency policy remain future work.

## MCP stdio

```bash
pip install -e packages/python-sdk -e packages/mcp-server
OPENREEL_API_KEY=your-key OPENREEL_URL=http://localhost:8000 openreel-mcp
```

Client configuration (replace the executable path and key locally; never commit real credentials):

```json
{
  "mcpServers": {
    "openreel": {
      "command": "/absolute/path/to/.venv/bin/openreel-mcp",
      "env": {
        "OPENREEL_URL": "http://localhost:8000",
        "OPENREEL_API_KEY": "YOUR_LOCAL_KEY"
      }
    }
  }
}
```

Tools: `create_project`, `add_scene` (existing authenticated asset ID), `render_video`, `get_job_status`, `get_usage`. They call the real authenticated backend. They do not expose arbitrary filesystem upload/download, admin operations, social publishing, or nonexistent AI tools. API workspace/concurrency rules apply equally to MCP. Rendering spends local compute, so enable appropriate tool confirmation in the MCP client. Keep stdio logs off protocol stdout.
