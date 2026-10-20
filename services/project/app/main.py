import hashlib
import hmac
import secrets
import string
from datetime import UTC, datetime
from typing import Annotated

from fastapi import FastAPI, Header, HTTPException, Path, Response, status
from pymongo.errors import DuplicateKeyError

from . import db
from .models import CreatedProject, CreateProjectInput, Project, ProjectInput, ProjectSummary

app = FastAPI(title="Bytebox Project Service")

SLUG_ALPHABET = string.ascii_letters + string.digits
SLUG_LENGTH = 8
Slug = Annotated[str, Path(pattern=f"^[A-Za-z0-9]{{{SLUG_LENGTH}}}$")]
EditToken = Annotated[str | None, Header(alias="X-Edit-Token")]
# Set by the gateway for signed-in users. Only the gateway may call this service directly.
UserId = Annotated[str | None, Header(alias="X-User-Id")]


@app.get("/health")
def health():
    return {"status": "ok", "service": "project"}


@app.get("/projects", response_model=list[ProjectSummary])
def list_my_projects(user_id: UserId = None):
    if not user_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sign in to see your projects")
    documents = db.projects.find({"owner_id": user_id}).sort("updated_at", -1).limit(100)
    return [
        ProjectSummary(
            slug=document["_id"],
            title=document["title"],
            file_count=len(document["files"]),
            updated_at=document["updated_at"],
        )
        for document in documents
    ]


@app.post("/projects", status_code=status.HTTP_201_CREATED, response_model=CreatedProject)
def create_project(body: CreateProjectInput, user_id: UserId = None):
    if body.forked_from and not db.projects.find_one({"_id": body.forked_from}, {"_id": 1}):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "The project to fork was not found")

    edit_token = secrets.token_urlsafe(32)
    now = datetime.now(UTC)
    document = {
        **body.model_dump(),
        "edit_token_hash": hash_token(edit_token),
        "owner_id": user_id,
        "created_at": now,
        "updated_at": now,
    }

    # Retry in the very unlikely case the random slug is already taken
    for _ in range(5):
        document["_id"] = new_slug()
        try:
            db.projects.insert_one(document)
            return {"project": to_project(document), "edit_token": edit_token}
        except DuplicateKeyError:
            continue
    raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Could not create a unique link")


@app.get("/projects/{slug}", response_model=Project)
def get_project(slug: Slug):
    return to_project(find_project(slug))


@app.put("/projects/{slug}", response_model=Project)
def update_project(slug: Slug, body: ProjectInput, edit_token: EditToken = None, user_id: UserId = None):
    document = find_project(slug)
    check_can_edit(document, edit_token, user_id)
    changes = {**body.model_dump(), "updated_at": datetime.now(UTC)}
    # A signed-in user saving a project made without login (with its edit token) becomes its owner
    if user_id and not document.get("owner_id"):
        changes["owner_id"] = user_id
    db.projects.update_one({"_id": slug}, {"$set": changes})
    return to_project(find_project(slug))


@app.delete("/projects/{slug}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(slug: Slug, edit_token: EditToken = None, user_id: UserId = None):
    check_can_edit(find_project(slug), edit_token, user_id)
    db.projects.delete_one({"_id": slug})
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def find_project(slug):
    document = db.projects.find_one({"_id": slug})
    if document is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    return document


# The owner (signed in) or anyone with the project's edit token may change it
def check_can_edit(document, edit_token, user_id):
    is_owner = user_id is not None and document.get("owner_id") == user_id
    has_token = edit_token is not None and hmac.compare_digest(
        document["edit_token_hash"], hash_token(edit_token)
    )
    if not (is_owner or has_token):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can't edit this project")


def to_project(document):
    return Project(slug=document["_id"], **document)


def new_slug():
    return "".join(secrets.choice(SLUG_ALPHABET) for _ in range(SLUG_LENGTH))


def hash_token(token):
    # Only a hash is stored, so a database leak doesn't expose edit tokens
    return hashlib.sha256(token.encode()).hexdigest()
