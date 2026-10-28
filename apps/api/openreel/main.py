import hashlib
import logging
import os
import secrets
import shutil
import subprocess
import time
import uuid
from collections import defaultdict, deque
from datetime import timedelta

from argon2 import PasswordHasher
from argon2.exceptions import VerificationError
from fastapi import Depends, FastAPI, File, HTTPException, Request, Response, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DB

from .db import (
    ApiKey,
    Asset,
    Job,
    Membership,
    Project,
    Scene,
    Session,
    SessionLocal,
    User,
    Workspace,
    now,
)
from .media import path_for, probe

app = FastAPI(title="OpenReel AI", version="0.1.0")
logger = logging.getLogger("openreel")
logging.basicConfig(level=logging.INFO, format="%(message)s")
hasher = PasswordHasher()
COOKIE = "openreel_session"
buckets = defaultdict(deque)


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def db():
    with SessionLocal() as session:
        yield session


@app.middleware("http")
async def safety(request: Request, call_next):
    request_id = str(uuid.uuid4())
    if request.method not in ("GET", "HEAD", "OPTIONS") and request.cookies.get(COOKIE):
        origin = request.headers.get("origin")
        allowed = os.getenv("PUBLIC_ORIGIN")
        if origin and origin not in (
            allowed.split(",") if allowed else [str(request.base_url).rstrip("/")]
        ):
            return JSONResponse(
                {"error": {"code": "csrf", "message": "Origin rejected"}}, 403
            )
        if request.headers.get("x-openreel-client") != "1":
            return JSONResponse(
                {"error": {"code": "csrf", "message": "Client header required"}}, 403
            )
    # Per-process abuse guard; deploy a shared edge limiter for multiple replicas.
    key = request.client.host if request.client else "unknown"
    queue = buckets[key]
    stamp = time.monotonic()
    while queue and queue[0] < stamp - 60:
        queue.popleft()
    if request.url.path in ("/api/v1/auth/login", "/api/v1/auth/register"):
        auth_queue = buckets["auth:" + key]
        while auth_queue and auth_queue[0] < stamp - 60:
            auth_queue.popleft()
        if len(auth_queue) >= 15:
            return JSONResponse(
                {
                    "error": {
                        "code": "rate_limit",
                        "message": "Too many authentication attempts",
                    }
                },
                429,
                headers={"Retry-After": "60"},
            )
        auth_queue.append(stamp)
    if len(queue) >= 300:
        return JSONResponse(
            {"error": {"code": "rate_limit", "message": "Too many requests"}},
            429,
            headers={"Retry-After": "60"},
        )
    queue.append(stamp)
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    logger.info(
        '{"request_id":"%s","method":"%s","status":%s}',
        request_id,
        request.method,
        response.status_code,
    )
    return response


@app.exception_handler(HTTPException)
async def http_error(request, exc):
    return JSONResponse(
        {"error": {"code": str(exc.status_code), "message": exc.detail}},
        exc.status_code,
    )


@app.exception_handler(RequestValidationError)
async def validation_error(request, exc):
    return JSONResponse(
        {
            "error": {
                "code": "validation",
                "message": "Invalid request",
                "fields": [
                    {"field": ".".join(map(str, e["loc"])), "message": e["msg"]}
                    for e in exc.errors()
                ],
            }
        },
        422,
    )


def current(request: Request, session: DB = Depends(db)):
    authorization = request.headers.get("authorization", "")
    if authorization.startswith("Bearer "):
        key = session.get(ApiKey, digest(authorization[7:]))
        user = session.get(User, key.user_id) if key else None
    else:
        token = request.cookies.get(COOKIE, "")
        record = session.get(Session, digest(token))
        user = (
            session.get(User, record.user_id)
            if record and record.expires.replace(tzinfo=now().tzinfo) > now()
            else None
        )
    if not user:
        raise HTTPException(401, "Please sign in") from None
    return user


def workspace(session, user):
    return session.scalar(
        select(Membership.workspace_id)
        .where(Membership.user_id == user.id)
        .order_by(Membership.workspace_id)
    )


def scoped(session, model, identifier, user):
    record = session.get(model, identifier)
    wid = record.workspace_id if record and hasattr(record, "workspace_id") else None
    if record and isinstance(record, Scene):
        wid = session.get(Project, record.project_id).workspace_id
    if not record or not session.get(Membership, (user.id, wid)):
        raise HTTPException(404, "Record not found") from None
    return record


class Credentials(BaseModel):
    email: str = Field(
        min_length=5, max_length=254, pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$"
    )
    password: str = Field(min_length=10, max_length=128)


def login_session(response, session, user):
    token = secrets.token_urlsafe(32)
    session.add(
        Session(token=digest(token), user_id=user.id, expires=now() + timedelta(days=7))
    )
    session.commit()
    response.set_cookie(
        COOKIE,
        token,
        httponly=True,
        secure=os.getenv("COOKIE_SECURE", "false") == "true",
        samesite="lax",
        max_age=604800,
        path="/",
    )
    return {"id": user.id, "email": user.email}


@app.post("/api/v1/auth/register", status_code=201)
def register(data: Credentials, response: Response, session: DB = Depends(db)):
    user = User(email=data.email.lower(), password=hasher.hash(data.password))
    session.add(user)
    try:
        session.flush()
        space = Workspace(name="My studio")
        session.add(space)
        session.flush()
        session.add(Membership(user_id=user.id, workspace_id=space.id, role="owner"))
        return login_session(response, session, user)
    except IntegrityError:
        session.rollback()
        raise HTTPException(409, "Email already registered") from None


@app.post("/api/v1/auth/login")
def login(data: Credentials, response: Response, session: DB = Depends(db)):
    user = session.scalar(select(User).where(User.email == data.email.lower()))
    try:
        hasher.verify(
            user.password if user else hasher.hash("invalid-password"), data.password
        )
        if not user:
            raise HTTPException(401, "Invalid credentials") from None
    except VerificationError:
        raise HTTPException(401, "Invalid credentials") from None
    return login_session(response, session, user)


@app.post("/api/v1/auth/logout")
def logout(request: Request, response: Response, session: DB = Depends(db)):
    record = session.get(Session, digest(request.cookies.get(COOKIE, "")))
    if record:
        session.delete(record)
        session.commit()
    response.delete_cookie(COOKIE, path="/")
    return {"ok": True}


@app.get("/api/v1/me")
def me(user=Depends(current)):
    return {"id": user.id, "email": user.email}


@app.get("/api/v1/workspaces")
def workspaces(user=Depends(current), session: DB = Depends(db)):
    return session.scalars(
        select(Workspace).join(Membership).where(Membership.user_id == user.id)
    ).all()


class ProjectInput(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    script: str = Field(default="", max_length=50000)
    ratio: str = Field(default="9:16", pattern=r"^(9:16|16:9|1:1)$")


class ProjectEdit(ProjectInput):
    version: int
    music_id: str | None = None
    music_volume: float = Field(default=0.15, ge=0, le=1)


@app.get("/api/v1/projects")
def projects(
    limit: int = 30, offset: int = 0, user=Depends(current), session: DB = Depends(db)
):
    return session.scalars(
        select(Project)
        .where(Project.workspace_id == workspace(session, user))
        .order_by(Project.created.desc())
        .limit(max(1, min(limit, 100)))
        .offset(max(0, offset))
    ).all()


@app.post("/api/v1/projects", status_code=201)
def create_project(
    data: ProjectInput, user=Depends(current), session: DB = Depends(db)
):
    project = Project(workspace_id=workspace(session, user), **data.model_dump())
    session.add(project)
    session.commit()
    return project


@app.get("/api/v1/projects/{identifier}")
def get_project(identifier: str, user=Depends(current), session: DB = Depends(db)):
    return scoped(session, Project, identifier, user)


@app.patch("/api/v1/projects/{identifier}")
def edit_project(
    identifier: str, data: ProjectEdit, user=Depends(current), session: DB = Depends(db)
):
    project = scoped(session, Project, identifier, user)
    # Lock serializes version checks on PostgreSQL.
    project = session.scalar(
        select(Project)
        .where(Project.id == project.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if project.version != data.version:
        raise HTTPException(409, "Project changed; reload before saving") from None
    if data.music_id:
        asset = scoped(session, Asset, data.music_id, user)
        if asset.workspace_id != project.workspace_id or asset.kind != "audio":
            raise HTTPException(
                422, "Select an audio asset in this workspace"
            ) from None
    for key, value in data.model_dump(exclude={"version"}).items():
        setattr(project, key, value)
    project.version += 1
    session.commit()
    return project


@app.delete("/api/v1/projects/{identifier}", status_code=204)
def delete_project(identifier: str, user=Depends(current), session: DB = Depends(db)):
    project = scoped(session, Project, identifier, user)
    records = session.scalars(select(Job).where(Job.project_id == identifier)).all()
    if any(j.status in ("queued", "running") for j in records):
        raise HTTPException(
            409, "Cancel active jobs before deleting the project"
        ) from None
    for record in records:
        session.delete(record)
    for scene in session.scalars(select(Scene).where(Scene.project_id == identifier)):
        session.delete(scene)
    session.flush()
    session.delete(project)
    session.commit()


@app.get("/api/v1/projects/{identifier}/export")
def export_project(identifier: str, user=Depends(current), session: DB = Depends(db)):
    project = scoped(session, Project, identifier, user)
    scenes = session.scalars(
        select(Scene)
        .where(Scene.project_id == identifier)
        .order_by(Scene.sequence, Scene.id)
    ).all()
    return {
        "schema_version": 1,
        "title": project.title,
        "script": project.script,
        "ratio": project.ratio,
        "scenes": [
            {
                "asset_id": s.asset_id,
                "duration": s.duration,
                "narration": s.narration,
                "sequence": s.sequence,
            }
            for s in scenes
        ],
        "note": "Asset references are workspace-local. Download source media separately.",
    }


@app.get("/api/v1/projects/{identifier}/scenes")
def scenes(identifier: str, user=Depends(current), session: DB = Depends(db)):
    scoped(session, Project, identifier, user)
    return session.scalars(
        select(Scene)
        .where(Scene.project_id == identifier)
        .order_by(Scene.sequence, Scene.id)
    ).all()


class SceneInput(BaseModel):
    asset_id: str | None = None
    sequence: int = Field(default=0, ge=0, le=10000)
    duration: float = Field(default=5, ge=0.5, le=60)
    narration: str = Field(default="", max_length=2000)


class SceneEdit(SceneInput):
    version: int


def validate_scene(session, data, project, user):
    if data.asset_id:
        asset = scoped(session, Asset, data.asset_id, user)
        if (
            asset.kind not in ("image", "video")
            or asset.workspace_id != project.workspace_id
        ):
            raise HTTPException(
                422, "Select an image or video from this workspace"
            ) from None


@app.post("/api/v1/projects/{identifier}/scenes", status_code=201)
def add_scene(
    identifier: str, data: SceneInput, user=Depends(current), session: DB = Depends(db)
):
    project = scoped(session, Project, identifier, user)
    validate_scene(session, data, project, user)
    scene = Scene(project_id=identifier, **data.model_dump())
    session.add(scene)
    session.commit()
    return scene


@app.patch("/api/v1/scenes/{identifier}")
def edit_scene(
    identifier: str, data: SceneEdit, user=Depends(current), session: DB = Depends(db)
):
    scene = scoped(session, Scene, identifier, user)
    scene = session.scalar(
        select(Scene)
        .where(Scene.id == scene.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if scene.version != data.version:
        raise HTTPException(
            409, "Scene changed; reopen project before saving"
        ) from None
    validate_scene(session, data, session.get(Project, scene.project_id), user)
    scene.version += 1
    for key, value in data.model_dump(exclude={"version"}).items():
        setattr(scene, key, value)
    session.commit()
    return scene


@app.delete("/api/v1/scenes/{identifier}", status_code=204)
def delete_scene(identifier: str, user=Depends(current), session: DB = Depends(db)):
    session.delete(scoped(session, Scene, identifier, user))
    session.commit()


@app.get("/api/v1/assets")
def assets(user=Depends(current), session: DB = Depends(db)):
    return session.scalars(
        select(Asset)
        .where(Asset.workspace_id == workspace(session, user))
        .order_by(Asset.created.desc())
        .limit(200)
    ).all()


@app.post("/api/v1/assets", status_code=201)
def upload(
    file: UploadFile = File(...), user=Depends(current), session: DB = Depends(db)
):
    identifier = str(uuid.uuid4())
    target = path_for(identifier)
    size = 0
    try:
        with target.open("wb") as output:
            while chunk := file.file.read(1024 * 1024):
                size += len(chunk)
                if size > int(os.getenv("UPLOAD_LIMIT_MB", "100")) * 1024 * 1024:
                    raise HTTPException(413, "Upload exceeds file limit") from None
                output.write(chunk)
        try:
            # Real image decoding, otherwise inspect streams instead of trusting MIME.
            from PIL import Image

            try:
                with Image.open(target) as image:
                    if image.width * image.height > 40_000_000:
                        raise ValueError("Image dimensions exceed limit") from None
                    image.verify()
                metadata = probe(target)
                kind = "image"
            except (Image.UnidentifiedImageError, OSError):
                metadata = probe(target)
                streams = metadata.get("streams", [])
                kind = (
                    "video"
                    if any(s["codec_type"] == "video" for s in streams)
                    else "audio"
                )
                if not any(s["codec_type"] in ("video", "audio") for s in streams):
                    raise ValueError("No usable streams") from None
        except (
            ValueError,
            SyntaxError,
            Image.DecompressionBombError,
            subprocess.SubprocessError,
            FileNotFoundError,
        ):
            raise HTTPException(
                422,
                "Media could not be decoded; ensure FFmpeg is installed and file is valid",
            ) from None
        asset = Asset(
            id=identifier,
            workspace_id=workspace(session, user),
            name=(file.filename or "upload")[:200],
            kind=kind,
            path=identifier,
            size=size,
            media=metadata,
        )
        session.add(asset)
        session.commit()
        return asset
    except Exception:
        target.unlink(missing_ok=True)
        raise


@app.get("/api/v1/assets/{identifier}/download")
def download(identifier: str, user=Depends(current), session: DB = Depends(db)):
    asset = scoped(session, Asset, identifier, user)
    path = path_for(asset.path)
    if not path.exists():
        raise HTTPException(404, "File missing from storage") from None
    return FileResponse(
        path,
        filename=asset.name,
        media_type={
            "image": "image/png",
            "video": "video/mp4",
            "audio": "audio/mpeg",
        }.get(asset.kind, "application/octet-stream"),
    )


@app.post("/api/v1/projects/{identifier}/render", status_code=202)
def submit_render(identifier: str, user=Depends(current), session: DB = Depends(db)):
    project = scoped(session, Project, identifier, user)
    source = session.scalars(
        select(Scene)
        .where(Scene.project_id == identifier)
        .order_by(Scene.sequence, Scene.id)
    ).all()
    if not source or len(source) > 100 or sum(s.duration for s in source) > 1200:
        raise HTTPException(422, "Use 1–100 scenes and at most 20 minutes") from None
    session.execute(
        select(Workspace).where(Workspace.id == project.workspace_id).with_for_update()
    )
    active = session.scalar(
        select(func.count())
        .select_from(Job)
        .where(
            Job.workspace_id == project.workspace_id,
            Job.status.in_(["queued", "running"]),
        )
    )
    if active >= 3:
        raise HTTPException(429, "Workspace limit: three active renders") from None
    snapshot = []
    for scene in source:
        asset = scoped(session, Asset, scene.asset_id, user) if scene.asset_id else None
        if not asset:
            raise HTTPException(422, "Every scene needs an image or video") from None
        snapshot.append(
            {
                "path": asset.path,
                "kind": asset.kind,
                "duration": scene.duration,
                "narration": scene.narration,
            }
        )
    music = (
        scoped(session, Asset, project.music_id, user).path
        if project.music_id
        else None
    )
    job = Job(
        workspace_id=project.workspace_id,
        project_id=identifier,
        payload={
            "scenes": snapshot,
            "ratio": project.ratio,
            "music": music,
            "music_volume": project.music_volume,
        },
    )
    session.add(job)
    session.commit()
    return job


@app.get("/api/v1/jobs")
def jobs(user=Depends(current), session: DB = Depends(db)):
    return session.scalars(
        select(Job)
        .where(Job.workspace_id == workspace(session, user))
        .order_by(Job.created.desc())
        .limit(100)
    ).all()


@app.get("/api/v1/jobs/{identifier}")
def get_job(identifier: str, user=Depends(current), session: DB = Depends(db)):
    return scoped(session, Job, identifier, user)


@app.post("/api/v1/jobs/{identifier}/cancel")
def cancel_job(identifier: str, user=Depends(current), session: DB = Depends(db)):
    job = scoped(session, Job, identifier, user)
    if job.status not in ("queued", "running"):
        raise HTTPException(409, "Job is already terminal") from None
    job.status = "cancelled"
    job.stage = "Cancelled; an active FFmpeg command stops at its next checkpoint"
    session.commit()
    return job


@app.post("/api/v1/jobs/{identifier}/retry", status_code=202)
def retry_job(identifier: str, user=Depends(current), session: DB = Depends(db)):
    job = scoped(session, Job, identifier, user)
    if job.status not in ("failed", "cancelled") or job.attempts >= 3:
        raise HTTPException(
            409, "Only failed/cancelled jobs with fewer than three attempts can retry"
        ) from None
    job.status, job.error, job.progress, job.stage = (
        "queued",
        None,
        0,
        "Queued for retry",
    )
    session.commit()
    return job


@app.get("/api/v1/usage")
def usage(user=Depends(current), session: DB = Depends(db)):
    wid = workspace(session, user)
    return {
        "storage_bytes": session.scalar(
            select(func.coalesce(func.sum(Asset.size), 0)).where(
                Asset.workspace_id == wid
            )
        ),
        "projects": session.scalar(
            select(func.count()).select_from(Project).where(Project.workspace_id == wid)
        ),
        "completed_renders": session.scalar(
            select(func.count())
            .select_from(Job)
            .where(
                Job.workspace_id == wid, Job.status == "completed", Job.kind == "render"
            )
        ),
        "compute_cost": None,
        "cost_note": "Local compute cost is not configured. No external paid calls are made by rendering.",
    }


class KeyInput(BaseModel):
    name: str = Field(min_length=1, max_length=100)


@app.post("/api/v1/api-keys", status_code=201)
def create_key(data: KeyInput, user=Depends(current), session: DB = Depends(db)):
    token = "or_" + secrets.token_urlsafe(32)
    key = ApiKey(token=digest(token), user_id=user.id, name=data.name)
    session.add(key)
    session.commit()
    return {"id": key.token, "name": data.name, "key": token}


@app.get("/api/v1/api-keys")
def keys(user=Depends(current), session: DB = Depends(db)):
    return [
        {"id": k.token, "name": k.name}
        for k in session.scalars(select(ApiKey).where(ApiKey.user_id == user.id))
    ]


@app.delete("/api/v1/api-keys/{identifier}", status_code=204)
def revoke(identifier: str, user=Depends(current), session: DB = Depends(db)):
    key = session.get(ApiKey, identifier)
    if not key or key.user_id != user.id:
        raise HTTPException(404, "Key not found") from None
    session.delete(key)
    session.commit()


@app.get("/api/v1/providers")
def providers(user=Depends(current)):
    return [
        {
            "id": "ollama",
            "configured": bool(os.getenv("OLLAMA_URL")),
            "model": os.getenv("OLLAMA_MODEL"),
            "capabilities": ["script"],
            "note": "Runs on your configured host; model availability is checked during generation.",
        },
        {
            "id": "ffmpeg",
            "configured": bool(shutil.which("ffmpeg")),
            "capabilities": ["uploaded-media-assembly"],
            "note": "Image slideshows are not generative AI video.",
        },
    ]


class ScriptInput(BaseModel):
    topic: str = Field(min_length=3, max_length=4000)


@app.post("/api/v1/scripts/generate", status_code=202)
def generate_script(
    data: ScriptInput, project_id: str, user=Depends(current), session: DB = Depends(db)
):
    project = scoped(session, Project, project_id, user)
    if not os.getenv("OLLAMA_URL") or not os.getenv("OLLAMA_MODEL"):
        raise HTTPException(
            503, "Configure OLLAMA_URL and OLLAMA_MODEL on the worker host"
        ) from None
    session.execute(
        select(Workspace).where(Workspace.id == project.workspace_id).with_for_update()
    )
    active = session.scalar(
        select(func.count())
        .select_from(Job)
        .where(
            Job.workspace_id == project.workspace_id,
            Job.status.in_(["queued", "running"]),
        )
    )
    if active >= 3:
        raise HTTPException(429, "Workspace limit: three active jobs") from None
    job = Job(
        workspace_id=project.workspace_id,
        project_id=project.id,
        kind="script",
        payload={"topic": data.topic},
    )
    session.add(job)
    session.commit()
    return job


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/ready")
def ready(session: DB = Depends(db)):
    try:
        session.execute(text("SELECT 1"))
        session.execute(select(Project.id).limit(1))
    except Exception:
        raise HTTPException(503, "Database unavailable or migrations missing") from None
    if not shutil.which("ffmpeg"):
        raise HTTPException(503, "FFmpeg unavailable") from None
    return {"status": "ready"}
