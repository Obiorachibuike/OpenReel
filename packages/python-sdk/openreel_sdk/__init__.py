"""Small synchronous SDK for the implemented OpenReel media workflow."""

import time
from pathlib import Path
from typing import Literal

import httpx
from pydantic import BaseModel


class Project(BaseModel):
    id: str
    title: str
    script: str
    ratio: str
    version: int


class Job(BaseModel):
    id: str
    status: Literal["queued", "running", "completed", "failed", "cancelled"]
    progress: int
    error: str | None = None
    result_id: str | None = None


class OpenReelError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


class OpenReelClient:
    def __init__(
        self, api_key: str, base_url: str = "http://localhost:8000", timeout: float = 30
    ):
        self.http = httpx.Client(
            base_url=base_url.rstrip("/") + "/api/v1/",
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=timeout,
        )

    def close(self):
        self.http.close()

    def request(self, method: str, path: str, **kwargs):
        response = self.http.request(method, path, **kwargs)
        if response.is_error:
            raise OpenReelError(response.status_code, response.text)
        return response.json() if response.content else None

    def create_project(
        self, title: str, script: str = "", ratio: str = "9:16"
    ) -> Project:
        return Project.model_validate(
            self.request(
                "POST",
                "projects",
                json={"title": title, "script": script, "ratio": ratio},
            )
        )

    def list_projects(self) -> list[Project]:
        return [Project.model_validate(p) for p in self.request("GET", "projects")]

    def add_scene(self, project_id: str, **scene):
        return self.request("POST", f"projects/{project_id}/scenes", json=scene)

    def upload(self, path: str):
        with Path(path).open("rb") as file:
            return self.request(
                "POST", "assets", files={"file": (Path(path).name, file)}
            )

    def render(self, project_id: str) -> Job:
        return Job.model_validate(self.request("POST", f"projects/{project_id}/render"))

    def get_job(self, job_id: str) -> Job:
        return Job.model_validate(self.request("GET", f"jobs/{job_id}"))

    def wait_for_completion(
        self, job_id: str, timeout: float = 900, interval: float = 2
    ) -> Job:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            job = self.get_job(job_id)
            if job.status == "completed":
                return job
            if job.status in ("failed", "cancelled"):
                raise OpenReelError(409, job.error or job.status)
            time.sleep(interval)
        raise OpenReelError(408, "Polling deadline exceeded")

    def download(self, asset_id: str, target: str):
        with self.http.stream("GET", f"assets/{asset_id}/download") as response:
            if response.is_error:
                raise OpenReelError(response.status_code, "Download failed")
            with Path(target).open("wb") as output:
                for chunk in response.iter_bytes():
                    output.write(chunk)

    def usage(self):
        return self.request("GET", "usage")
