import asyncio

import httpx
import pytest
from openreel_sdk import OpenReelClient, OpenReelError


def test_python_client():
    def handler(request):
        assert request.headers["authorization"] == "Bearer test"
        assert request.url.path == "/api/v1/projects"
        return httpx.Response(
            200,
            json={
                "id": "project",
                "title": "Ocean",
                "script": "",
                "ratio": "9:16",
                "version": 1,
            },
        )

    client = OpenReelClient("test")
    client.http = httpx.Client(
        base_url="http://local/api/v1/",
        transport=httpx.MockTransport(handler),
        headers={"Authorization": "Bearer test"},
    )
    assert client.create_project("Ocean").id == "project"
    client.close()


def test_python_error():
    client = OpenReelClient("test")
    client.http = httpx.Client(
        base_url="http://local/api/v1/",
        transport=httpx.MockTransport(
            lambda r: httpx.Response(401, json={"error": "Denied"})
        ),
    )
    with pytest.raises(OpenReelError):
        client.list_projects()
    client.close()


def test_mcp_tools_registered_and_use_backend(monkeypatch):
    import openreel_mcp as server

    called = []

    class Fake:
        def usage(self):
            called.append("usage")
            return {"storage_bytes": 123}

        def close(self):
            called.append("close")

    monkeypatch.setattr(server, "client", lambda: Fake())
    assert server.get_usage() == {"storage_bytes": 123}
    assert called == ["usage", "close"]
    tools = asyncio.run(server.mcp.list_tools())
    assert {
        "create_project",
        "add_scene",
        "render_video",
        "get_job_status",
        "get_usage",
    } == {t.name for t in tools}


def test_mcp_requires_credentials(monkeypatch):
    import openreel_mcp as server

    monkeypatch.delenv("OPENREEL_API_KEY", raising=False)
    with pytest.raises(ValueError, match="required"):
        server.client()
