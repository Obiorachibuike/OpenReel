import os
import tempfile
from pathlib import Path

import pytest

# Isolated file DB supports worker sessions and exercises Alembic, not create_all.
TEST_ROOT = tempfile.TemporaryDirectory(prefix="openreel-tests-")
os.environ["DATABASE_URL"] = (
    os.getenv("TEST_DATABASE_URL") or f"sqlite:///{TEST_ROOT.name}/test.db"
)
os.environ["STORAGE_PATH"] = str(Path(TEST_ROOT.name) / "media")
os.environ["COOKIE_SECURE"] = "false"

from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from openreel.main import app, buckets  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def migrated():
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    config.set_main_option(
        "script_location", str(Path(__file__).resolve().parents[1] / "migrations")
    )
    command.upgrade(config, "head")
    yield
    command.downgrade(config, "base")


@pytest.fixture
def client():
    buckets.clear()
    with TestClient(app, headers={"X-OpenReel-Client": "1"}) as client:
        yield client


@pytest.fixture
def account(client):
    import uuid

    result = client.post(
        "/api/v1/auth/register",
        json={"email": f"{uuid.uuid4()}@example.com", "password": "long-test-password"},
    )
    assert result.status_code == 201
    return client
