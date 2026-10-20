import hashlib
import hmac
import secrets
import string
from datetime import UTC, datetime
from typing import Annotated

from fastapi import FastAPI, Header, HTTPException, Path, Response, status
from pymongo.errors import DuplicateKeyError

from . import db
from .models import CreatedProject, CreateProjectInput, Project, ProjectInput

app = FastAPI(title="Bytebox Project Service")

SLUG_ALPHABET = string.ascii_letters + string.digits
SLUG_LENGTH = 8
Slug = Annotated[str, Path(pattern=f"^[A-Za-z0-9]{{{SLUG_LENGTH}}}$")]
EditToken = Annotated[str, Header(alias="X-Edit-Token")]


@app.get("/health")
def health():
    return {"status": "ok", "service": "project"}


@app.post("/projects", status_code=status.HTTP_201_CREATED, response_model=CreatedProject)
def create_project(body: CreateProjectInput):
    if body.forked_from and not db.projects.find_one({"_id": body.forked_from}, {"_id": 1}):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "The project to fork was not found")

    edit_token = secrets.token_urlsafe(32)
    now = datetime.now(UTC)
    document = {
        **body.model_dump(),
        "edit_token_hash": hash_token(edit_token),
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
def update_project(slug: Slug, body: ProjectInput, edit_token: EditToken):
    check_token(find_project(slug), edit_token)
    changes = {**body.model_dump(), "updated_at": datetime.now(UTC)}
    db.projects.update_one({"_id": slug}, {"$set": changes})
    return to_project(find_project(slug))


@app.delete("/projects/{slug}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(slug: Slug, edit_token: EditToken):
    check_token(find_project(slug), edit_token)
    db.projects.delete_one({"_id": slug})
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def find_project(slug):
    document = db.projects.find_one({"_id": slug})
    if document is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    return document


def check_token(document, edit_token):
    if not hmac.compare_digest(document["edit_token_hash"], hash_token(edit_token)):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can't edit this project")


def to_project(document):
    return Project(slug=document["_id"], **document)


def new_slug():
    return "".join(secrets.choice(SLUG_ALPHABET) for _ in range(SLUG_LENGTH))


def hash_token(token):
    # Only a hash is stored, so a database leak doesn't expose edit tokens
    return hashlib.sha256(token.encode()).hexdigest()
