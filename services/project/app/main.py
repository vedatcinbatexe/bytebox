import secrets
import string
from datetime import UTC, datetime
from typing import Annotated

from fastapi import FastAPI, Header, HTTPException, Path, Response, status
from bson import ObjectId
from bson.errors import InvalidId
from pymongo.errors import DuplicateKeyError

from . import db
from .models import (
    CreateProjectInput,
    Project,
    ProjectInput,
    ProjectSummary,
    RenameInput,
    Version,
    VersionSummary,
)

app = FastAPI(title="Bytebox Project Service")

SLUG_ALPHABET = string.ascii_letters + string.digits
MAX_VERSIONS = 30  # per project
SLUG_LENGTH = 8
Slug = Annotated[str, Path(pattern=f"^[A-Za-z0-9]{{{SLUG_LENGTH}}}$")]
# Set by the gateway from a verified session. Only the gateway may call this service directly.
UserId = Annotated[str | None, Header(alias="X-User-Id")]


@app.get("/health")
def health():
    return {"status": "ok", "service": "project"}


@app.get("/projects", response_model=list[ProjectSummary])
def list_my_projects(user_id: UserId = None):
    owner = require_user(user_id)
    documents = db.projects.find({"owner_id": owner}).sort("updated_at", -1).limit(100)
    return [
        ProjectSummary(
            slug=document["_id"],
            title=document["title"],
            file_count=len(document["files"]),
            updated_at=document["updated_at"],
        )
        for document in documents
    ]


@app.post("/projects", status_code=status.HTTP_201_CREATED, response_model=Project)
def create_project(body: CreateProjectInput, user_id: UserId = None):
    owner = require_user(user_id)
    if body.forked_from and not db.projects.find_one({"_id": body.forked_from}, {"_id": 1}):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "The project to fork was not found")

    now = datetime.now(UTC)
    document = {**body.model_dump(), "owner_id": owner, "created_at": now, "updated_at": now}

    # Retry in the very unlikely case the random slug is already taken
    for _ in range(5):
        document["_id"] = new_slug()
        try:
            db.projects.insert_one(document)
            return to_project(document)
        except DuplicateKeyError:
            continue
    raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Could not create a unique link")


@app.get("/projects/{slug}", response_model=Project)
def get_project(slug: Slug):
    return to_project(find_project(slug))


@app.put("/projects/{slug}", response_model=Project)
def update_project(slug: Slug, body: ProjectInput, user_id: UserId = None):
    document = find_project(slug)
    check_owner(document, require_user(user_id))
    keep_version(document)
    db.projects.update_one({"_id": slug}, {"$set": {**body.model_dump(), "updated_at": datetime.now(UTC)}})
    return to_project(find_project(slug))


@app.patch("/projects/{slug}", response_model=Project)
def rename_project(slug: Slug, body: RenameInput, user_id: UserId = None):
    document = find_project(slug)
    check_owner(document, require_user(user_id))
    keep_version(document)
    db.projects.update_one({"_id": slug}, {"$set": {"title": body.title, "updated_at": datetime.now(UTC)}})
    return to_project(find_project(slug))


@app.delete("/projects/{slug}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(slug: Slug, user_id: UserId = None):
    check_owner(find_project(slug), require_user(user_id))
    db.projects.delete_one({"_id": slug})
    db.versions.delete_many({"project_id": slug})
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/projects/{slug}/versions", response_model=list[VersionSummary])
def list_versions(slug: Slug, user_id: UserId = None):
    check_owner(find_project(slug), require_user(user_id))
    documents = db.versions.find({"project_id": slug}).sort("saved_at", -1)
    return [
        VersionSummary(id=str(d["_id"]), title=d["title"], file_count=len(d["files"]), saved_at=d["saved_at"])
        for d in documents
    ]


@app.get("/projects/{slug}/versions/{version_id}", response_model=Version)
def get_version(slug: Slug, version_id: str, user_id: UserId = None):
    check_owner(find_project(slug), require_user(user_id))
    return to_version(find_version(slug, version_id))


@app.post("/projects/{slug}/versions/{version_id}/restore", response_model=Project)
def restore_version(slug: Slug, version_id: str, user_id: UserId = None):
    document = find_project(slug)
    check_owner(document, require_user(user_id))
    version = find_version(slug, version_id)
    keep_version(document)  # restoring is a change too, so the current version stays in history
    content = {key: version[key] for key in ("title", "files", "folders", "stdin")}
    db.projects.update_one({"_id": slug}, {"$set": {**content, "updated_at": datetime.now(UTC)}})
    return to_project(find_project(slug))


def keep_version(document):
    """Store the project as it is now, then drop versions beyond MAX_VERSIONS."""
    db.versions.insert_one(
        {
            "project_id": document["_id"],
            "title": document["title"],
            "files": document["files"],
            "folders": document.get("folders", []),
            "stdin": document.get("stdin", ""),
            "saved_at": document["updated_at"],
        }
    )
    old = db.versions.find({"project_id": document["_id"]}, {"_id": 1}).sort("saved_at", -1).skip(MAX_VERSIONS)
    old_ids = [d["_id"] for d in old]
    if old_ids:
        db.versions.delete_many({"_id": {"$in": old_ids}})


def find_version(slug, version_id):
    try:
        version = db.versions.find_one({"_id": ObjectId(version_id), "project_id": slug})
    except InvalidId:
        version = None
    if version is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Version not found")
    return version


def to_version(document):
    return Version(id=str(document["_id"]), **{k: v for k, v in document.items() if k != "_id"})


def require_user(user_id):
    if not user_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sign in first")
    return user_id


def find_project(slug):
    document = db.projects.find_one({"_id": slug})
    if document is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    return document


def check_owner(document, user_id):
    if document.get("owner_id") != user_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the owner can change this project")


def to_project(document):
    return Project(slug=document["_id"], **document)


def new_slug():
    return "".join(secrets.choice(SLUG_ALPHABET) for _ in range(SLUG_LENGTH))
