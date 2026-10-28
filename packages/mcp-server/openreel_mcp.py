"""Authenticated stdio MCP tools; no publishing or unrestricted filesystem tools."""

import os

from mcp.server.mcpserver import MCPServer
from openreel_sdk import OpenReelClient

mcp = MCPServer("OpenReel AI")


def client():
    key = os.environ.get("OPENREEL_API_KEY")
    if not key:
        raise ValueError("OPENREEL_API_KEY is required")
    return OpenReelClient(key, os.environ.get("OPENREEL_URL", "http://localhost:8000"))


def invoke(callback):
    api = client()
    try:
        return callback(api)
    finally:
        api.close()


@mcp.tool()
def create_project(title: str, script: str = "", ratio: str = "9:16") -> dict:
    """Create a project in the authenticated workspace."""
    return invoke(lambda api: api.create_project(title, script, ratio).model_dump())


@mcp.tool()
def add_scene(
    project_id: str,
    asset_id: str,
    caption: str = "",
    duration: float = 5,
    sequence: int = 0,
) -> dict:
    """Add an existing workspace media asset as a scene."""
    return invoke(
        lambda api: api.add_scene(
            project_id,
            asset_id=asset_id,
            narration=caption,
            duration=duration,
            sequence=sequence,
        )
    )


@mcp.tool()
def render_video(project_id: str) -> dict:
    """Queue a real FFmpeg render. Subject to workspace limits."""
    return invoke(lambda api: api.render(project_id).model_dump())


@mcp.tool()
def get_job_status(job_id: str) -> dict:
    """Inspect durable job state. Completion includes the downloadable asset ID."""
    return invoke(lambda api: api.get_job(job_id).model_dump())


@mcp.tool()
def get_usage() -> dict:
    """Return measured workspace usage; unknown compute cost is not zero."""
    return invoke(lambda api: api.usage())


def main():
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
