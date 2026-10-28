"""Durable DB queue. PostgreSQL row locks support multiple workers.

Leases recover after termination. One FFmpeg invocation is capped at 10 minutes;
leases are 15 minutes and refreshed between scenes. Run one worker with SQLite.
"""

import logging
import shutil
import time
from datetime import timedelta
from tempfile import TemporaryDirectory

from sqlalchemy import or_, select

from .db import Asset, Job, SessionLocal, now, uid
from .media import ROOT, path_for, render

logger = logging.getLogger("openreel.worker")


class Cancelled(Exception):
    pass


def claim():
    with SessionLocal.begin() as db:
        job = db.scalar(
            select(Job)
            .where(
                or_(
                    Job.status == "queued",
                    (Job.status == "running") & (Job.lease < now()),
                )
            )
            .order_by(Job.created)
            .with_for_update(skip_locked=True)
            .limit(1)
        )
        if not job:
            return None
        if job.attempts >= 3:
            job.status, job.error = "failed", "Worker recovery limit exceeded"
            return None
        job.status, job.stage, job.lease = (
            "running",
            "Validating media",
            now() + timedelta(minutes=15),
        )
        job.attempts += 1
        return job.id, job.payload, job.workspace_id, job.kind


def run_once():
    claimed = claim()
    if not claimed:
        return False
    identifier, payload, workspace_id, kind = claimed

    def update(progress, stage):
        with SessionLocal.begin() as db:
            job = db.get(Job, identifier, with_for_update=True)
            if job.status == "cancelled":
                raise Cancelled()
            job.progress, job.stage, job.lease = (
                progress,
                stage,
                now() + timedelta(minutes=15),
            )

    try:
        if kind == "script":
            from .providers import generate_script

            update(0, "Requesting configured text model")
            result = generate_script(payload["topic"])
            update(95, "Validating model response")
            with SessionLocal.begin() as db:
                job = db.get(Job, identifier, with_for_update=True)
                if job.status == "cancelled":
                    raise Cancelled()
                job.output, job.status, job.progress, job.stage = (
                    result,
                    "completed",
                    100,
                    "Draft ready for review",
                )
            return True
        with TemporaryDirectory(prefix="render-", dir=ROOT) as folder:
            from pathlib import Path

            output, metadata = render(payload, Path(folder), update)
            update(98, "Validating output")
            asset_id = uid()
            with SessionLocal.begin() as db:
                job = db.get(Job, identifier, with_for_update=True)
                if job.status == "cancelled":
                    raise Cancelled()
                shutil.copyfile(output, path_for(asset_id))
                db.add(
                    Asset(
                        id=asset_id,
                        workspace_id=workspace_id,
                        name=f"openreel-{identifier[:8]}.mp4",
                        kind="video",
                        path=asset_id,
                        size=output.stat().st_size,
                        media=metadata,
                    )
                )
                db.flush()
                job.result_id, job.status, job.progress, job.stage = (
                    asset_id,
                    "completed",
                    100,
                    "Ready to download",
                )
    except Cancelled:
        pass
    except Exception as exc:
        logger.error("job=%s failure_type=%s", identifier, type(exc).__name__)
        with SessionLocal.begin() as db:
            job = db.get(Job, identifier)
            if job.status != "cancelled":
                job.status, job.error, job.stage = (
                    "failed",
                    f"{type(exc).__name__}: media operation failed; inspect source files and worker installation",
                    "Failed",
                )
    return True


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    while True:
        if not run_once():
            time.sleep(2)
