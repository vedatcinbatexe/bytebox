import os
import sys
from pathlib import Path

import pytest

# Use a separate database for tests (needs MongoDB from docker compose on localhost:27017)
os.environ["MONGO_DB"] = "bytebox_test"
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

from app import db  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture
def client():
    db.projects.delete_many({})
    db.versions.delete_many({})
    db.stars.delete_many({})
    db.comments.delete_many({})
    yield TestClient(app)
    db.projects.delete_many({})
    db.versions.delete_many({})
    db.stars.delete_many({})
    db.comments.delete_many({})
