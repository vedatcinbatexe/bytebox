import secrets
import string
from datetime import UTC, datetime
from typing import Annotated

from fastapi import FastAPI, Header, HTTPException, Path, Response, status
from pymongo.errors import DuplicateKeyError

from . import db
from .models import CreateProjectInput, Project, ProjectInput, ProjectSummary

app = FastAPI(title="Bytebox Project Service")

SLUG_ALPHABET = string.ascii_letters + string.digits
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
    check_owner(find_project(slug), require_user(user_id))
    db.projects.update_one({"_id": slug}, {"$set": {**body.model_dump(), "updated_at": datetime.now(UTC)}})
    return to_project(find_project(slug))


@app.delete("/projects/{slug}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(slug: Slug, user_id: UserId = None):
    check_owner(find_project(slug), require_user(user_id))
    db.projects.delete_one({"_id": slug})
    return Response(status_code=status.HTTP_204_NO_CONTENT)


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
