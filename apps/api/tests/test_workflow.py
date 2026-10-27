import io
import subprocess
import wave

from fastapi.testclient import TestClient
from openreel.db import Job, SessionLocal, now
from openreel.main import app
from openreel.media import ass_text, path_for, probe, subtitle_time
from openreel.worker import run_once
from PIL import Image
from sqlalchemy import select


def project(client):
    r = client.post(
        "/api/v1/projects", json={"title": "A real first cut", "ratio": "16:9"}
    )
    assert r.status_code == 201, r.text
    return r.json()


def image(client):
    buf = io.BytesIO()
    Image.new("RGB", (320, 240), "#48795a").save(buf, "PNG")
    r = client.post(
        "/api/v1/assets", files={"file": ("frame.png", buf.getvalue(), "image/png")}
    )
    assert r.status_code == 201, r.text
    return r.json()


def test_auth_validation_logout(client):
    assert client.get("/api/v1/projects").status_code == 401
    assert (
        client.post(
            "/api/v1/auth/register", json={"email": "bad", "password": "x"}
        ).status_code
        == 422
    )
    credentials = {"email": "auth@example.com", "password": "correct-test-password"}
    assert client.post("/api/v1/auth/register", json=credentials).status_code == 201
    assert (
        "HttpOnly" in client.cookies.get("openreel_session", "")
        or client.get("/api/v1/me").status_code == 200
    )
    assert client.post("/api/v1/auth/logout").status_code == 200
    assert client.get("/api/v1/me").status_code == 401
    assert (
        client.post(
            "/api/v1/auth/login", json={**credentials, "password": "wrong-password"}
        ).status_code
        == 401
    )
    assert client.post("/api/v1/auth/login", json=credentials).status_code == 200


def test_isolation_api_keys_and_csrf(account):
    p = project(account)
    a = image(account)
    with TestClient(app, headers={"X-OpenReel-Client": "1"}) as other:
        other.post(
            "/api/v1/auth/register",
            json={"email": "other@example.com", "password": "long-test-password"},
        )
        assert other.get(f"/api/v1/projects/{p['id']}").status_code == 404
        assert other.get(f"/api/v1/assets/{a['id']}/download").status_code == 404
        assert (
            other.post(f"/api/v1/projects/{p['id']}/scenes", json={}).status_code == 404
        )
    key = account.post("/api/v1/api-keys", json={"name": "test"}).json()
    with TestClient(app, headers={"Authorization": f"Bearer {key['key']}"}) as sdk:
        assert sdk.get("/api/v1/projects").status_code == 200
        assert sdk.post("/api/v1/projects", json={"title": "SDK"}).status_code == 201
    assert (
        account.post(
            "/api/v1/projects",
            json={"title": "forged"},
            headers={"Origin": "https://evil.example"},
        ).status_code
        == 403
    )
    assert account.delete("/api/v1/api-keys/" + key["id"]).status_code == 204
    with TestClient(app, headers={"Authorization": f"Bearer {key['key']}"}) as sdk:
        assert sdk.get("/api/v1/projects").status_code == 401


def test_project_version_and_validation(account):
    p = project(account)
    assert account.patch("/api/v1/projects/" + p["id"], json=p).status_code == 200
    assert account.patch("/api/v1/projects/" + p["id"], json=p).status_code == 409
    assert (
        account.post("/api/v1/projects", json={"title": "", "ratio": "4:5"}).status_code
        == 422
    )
    assert account.post(f"/api/v1/projects/{p['id']}/render").status_code == 422
    assert (
        account.post(
            "/api/v1/assets", files={"file": ("not.png", b"not a png", "image/png")}
        ).status_code
        == 422
    )
    assert (
        account.post(
            "/api/v1/assets",
            files={
                "file": ("playlist", b"#EXTM3U\nhttp://127.0.0.1/private", "video/mp4")
            },
        ).status_code
        == 422
    )


def test_real_render_captions_audio_and_download(account):
    p, a = project(account), image(account)
    wav = io.BytesIO()
    with wave.open(wav, "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(16000)
        output.writeframes(b"\x00\x00" * 32000)
    audio = account.post(
        "/api/v1/assets", files={"file": ("music.wav", wav.getvalue(), "audio/wav")}
    ).json()
    assert (
        account.patch(
            f"/api/v1/projects/{p['id']}", json={**p, "music_id": audio["id"]}
        ).status_code
        == 200
    )
    scene = account.post(
        f"/api/v1/projects/{p['id']}/scenes",
        json={
            "asset_id": a["id"],
            "duration": 0.5,
            "narration": "A real frame. A real caption.",
        },
    )
    assert scene.status_code == 201
    r = account.post(f"/api/v1/projects/{p['id']}/render")
    assert r.status_code == 202
    identifier = r.json()["id"]
    assert run_once()
    job = account.get("/api/v1/jobs/" + identifier).json()
    assert job["status"] == "completed", job
    response = account.get(f"/api/v1/assets/{job['result_id']}/download")
    assert response.status_code == 200 and len(response.content) > 1000
    metadata = probe(path_for(job["result_id"]))
    assert {"video", "audio"} <= {s["codec_type"] for s in metadata["streams"]}
    assert metadata["streams"][0]["width"] == 1280
    assert 0.4 <= float(metadata["format"]["duration"]) < 1
    assert (
        account.get(f"/api/v1/projects/{p['id']}/scenes").json()[0]["id"]
        == scene.json()["id"]
    )


def test_failure_retry_cancel_and_lease_recovery(account):
    p, a = project(account), image(account)
    account.post(
        f"/api/v1/projects/{p['id']}/scenes",
        json={"asset_id": a["id"], "duration": 0.5},
    )
    job = account.post(f"/api/v1/projects/{p['id']}/render").json()
    path_for(a["id"]).unlink()
    run_once()
    assert account.get("/api/v1/jobs/" + job["id"]).json()["status"] == "failed"
    assert account.post("/api/v1/jobs/" + job["id"] + "/retry").status_code == 202
    assert (
        account.post("/api/v1/jobs/" + job["id"] + "/cancel").json()["status"]
        == "cancelled"
    )
    assert not run_once()
    with SessionLocal.begin() as db:
        record = db.scalar(select(Job).where(Job.id == job["id"]))
        record.status, record.lease = "running", now()
    assert run_once()
    assert account.get("/api/v1/jobs/" + job["id"]).json()["attempts"] == 2


def test_subtitles_and_path_safety():
    import pytest

    assert subtitle_time(61.25) == "0:01:01.25"
    assert "{" not in ass_text(r"{\an8}injected")
    with pytest.raises(ValueError):
        path_for("../private")


def test_provider_unavailable(account, monkeypatch):
    monkeypatch.delenv("OLLAMA_URL", raising=False)
    p = project(account)
    assert (
        account.post(
            "/api/v1/scripts/generate?project_id=" + p["id"], json={"topic": "Ocean"}
        ).status_code
        == 503
    )


def test_provider_job_and_malformed_output(account, monkeypatch):
    from openreel import providers

    monkeypatch.setenv("OLLAMA_URL", "http://configured")
    monkeypatch.setenv("OLLAMA_MODEL", "configured-model")
    monkeypatch.setattr(
        providers,
        "generate_script",
        lambda topic: {"script": "Reviewed draft", "review_required": True},
    )
    p = project(account)
    job = account.post(
        "/api/v1/scripts/generate?project_id=" + p["id"], json={"topic": "Ocean"}
    ).json()
    assert run_once()
    assert (
        account.get("/api/v1/jobs/" + job["id"]).json()["output"]["script"]
        == "Reviewed draft"
    )
    import httpx

    mock = httpx.Client(
        transport=httpx.MockTransport(
            lambda request: httpx.Response(200, json={"bad": "shape"})
        )
    )
    monkeypatch.setattr(providers.httpx, "Client", lambda **kwargs: mock)
    import pytest

    with pytest.raises(KeyError):
        providers.OllamaProvider().generate("Test")


def test_ffmpeg_available():
    assert subprocess.run(["ffmpeg", "-version"], capture_output=True).returncode == 0


def test_scene_conflicts_export_and_delete(account):
    p = project(account)
    s = account.post(
        f"/api/v1/projects/{p['id']}/scenes", json={"narration": "Original wording"}
    ).json()
    assert account.patch(f"/api/v1/scenes/{s['id']}", json=s).status_code == 200
    assert account.patch(f"/api/v1/scenes/{s['id']}", json=s).status_code == 409
    export = account.get(f"/api/v1/projects/{p['id']}/export").json()
    assert export["scenes"][0]["narration"] == "Original wording"
    assert account.delete(f"/api/v1/projects/{p['id']}").status_code == 204
    assert account.get(f"/api/v1/projects/{p['id']}").status_code == 404
