import re
import secrets
import string
from datetime import UTC, datetime, timedelta
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
    StarState,
    ProjectPatch,
    TagCount,
    ProjectStats,
    Comment,
    CommentInput,
    Version,
    VersionSummary,
)

app = FastAPI(title="Bytebox Project Service")

SLUG_ALPHABET = string.ascii_letters + string.digits
MAX_VERSIONS = 30  # per project
AUTOSAVE_VERSION_GAP = timedelta(minutes=2)  # autosaves keep at most one version per 2 minutes
SLUG_LENGTH = 8
Slug = Annotated[str, Path(pattern=f"^[A-Za-z0-9]{{{SLUG_LENGTH}}}$")]
# Set by the gateway from a verified session. Only the gateway may call this service directly.
UserId = Annotated[str | None, Header(alias="X-User-Id")]
UserLogin = Annotated[str | None, Header(alias="X-User-Login")]


def summary(document):
    return ProjectSummary(
        slug=document["_id"],
        title=document["title"],
        file_count=len(document["files"]),
        updated_at=document["updated_at"],
        visibility=document.get("visibility", "unlisted"),
        owner_login=document.get("owner_login"),
        star_count=document.get("star_count", 0),
        tags=document.get("tags", []),
    )


@app.get("/health")
def health():
    return {"status": "ok", "service": "project"}


@app.get("/projects", response_model=list[ProjectSummary])
def list_my_projects(user_id: UserId = None):
    owner = require_user(user_id)
    documents = db.projects.find({"owner_id": owner}).sort("updated_at", -1).limit(100)
    return [summary(document) for document in documents]


@app.get("/users/{login}/projects", response_model=list[ProjectSummary])
def public_projects_of(login: str):
    """A user's public projects, for their profile page."""
    documents = (
        db.projects.find({"visibility": "public", "owner_login": {"$regex": f"^{re.escape(login)}$", "$options": "i"}})
        .sort("updated_at", -1)
        .limit(100)
    )
    return [summary(document) for document in documents]


@app.get("/explore", response_model=list[ProjectSummary])
def explore(limit: int = 50, sort: str = "newest", tag: str | None = None):
    """Public projects, newest or most starred first, optionally with one tag."""
    order = [("star_count", -1), ("updated_at", -1)] if sort == "stars" else [("updated_at", -1)]
    query = {"visibility": "public", **({"tags": tag.lower()} if tag else {})}
    documents = db.projects.find(query).sort(order).limit(min(max(limit, 1), 100))
    return [summary(document) for document in documents]


@app.get("/stats", response_model=ProjectStats)
def stats():
    """Numbers for the public stats page."""
    return ProjectStats(
        projects=db.projects.count_documents({}),
        public_projects=db.projects.count_documents({"visibility": "public"}),
        stars=db.stars.count_documents({}),
    )


@app.get("/tags", response_model=list[TagCount])
def popular_tags(limit: int = 15):
    """The most used tags on public projects."""
    pipeline = [
        {"$match": {"visibility": "public"}},
        {"$unwind": "$tags"},
        {"$group": {"_id": "$tags", "count": {"$sum": 1}}},
        {"$sort": {"count": -1, "_id": 1}},
        {"$limit": min(max(limit, 1), 50)},
    ]
    return [TagCount(tag=row["_id"], count=row["count"]) for row in db.projects.aggregate(pipeline)]


@app.post("/projects", status_code=status.HTTP_201_CREATED, response_model=Project)
def create_project(body: CreateProjectInput, user_id: UserId = None, user_login: UserLogin = None):
    owner = require_user(user_id)
    if body.forked_from:
        original = db.projects.find_one({"_id": body.forked_from}, {"owner_id": 1, "visibility": 1})
        if original is None or not can_view(original, owner):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "The project to fork was not found")

    now = datetime.now(UTC)
    document = {
        **body.model_dump(),
        "owner_id": owner,
        "owner_login": user_login,
        "created_at": now,
        "updated_at": now,
    }

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
def get_project(slug: Slug, user_id: UserId = None):
    document = find_project(slug)
    if not can_view(document, user_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")  # don't reveal private projects
    project = to_project(document)
    if user_id:
        project.starred_by_me = db.stars.count_documents({"project_id": slug, "user_id": user_id}) > 0
    project.fork_count = db.projects.count_documents({"forked_from": slug})
    project.comment_count = db.comments.count_documents({"project_id": slug})
    if project.forked_from:
        original = db.projects.find_one({"_id": project.forked_from}, {"title": 1, "owner_id": 1, "visibility": 1})
        if original and can_view(original, user_id):
            project.forked_from_title = original["title"]
        else:
            project.forked_from = None  # don't link to a deleted or private project
    return project


@app.get("/projects/{slug}/forks", response_model=list[ProjectSummary])
def list_forks(slug: Slug, user_id: UserId = None):
    """Public forks of a project, newest first."""
    if not can_view(find_project(slug), user_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    documents = db.projects.find({"forked_from": slug, "visibility": "public"}).sort("updated_at", -1).limit(50)
    return [summary(document) for document in documents]


@app.put("/projects/{slug}/star", response_model=StarState)
def star(slug: Slug, user_id: UserId = None):
    user = require_user(user_id)
    document = find_project(slug)
    if not can_view(document, user):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    try:
        db.stars.insert_one({"project_id": slug, "user_id": user, "created_at": datetime.now(UTC)})
        db.projects.update_one({"_id": slug}, {"$inc": {"star_count": 1}})
    except DuplicateKeyError:
        pass  # already starred: starring twice changes nothing
    return star_state(slug, user)


@app.delete("/projects/{slug}/star", response_model=StarState)
def unstar(slug: Slug, user_id: UserId = None):
    user = require_user(user_id)
    find_project(slug)
    if db.stars.delete_one({"project_id": slug, "user_id": user}).deleted_count:
        db.projects.update_one({"_id": slug}, {"$inc": {"star_count": -1}})
    return star_state(slug, user)


def star_state(slug, user_id):
    count = db.projects.find_one({"_id": slug}, {"star_count": 1}).get("star_count", 0)
    starred = db.stars.count_documents({"project_id": slug, "user_id": user_id}) > 0
    return StarState(star_count=count, starred_by_me=starred)


@app.put("/projects/{slug}", response_model=Project)
def update_project(slug: Slug, body: ProjectInput, user_id: UserId = None, autosave: bool = False):
    document = find_project(slug)
    check_owner(document, require_user(user_id))
    if not (autosave and kept_version_recently(slug)):
        keep_version(document)
    db.projects.update_one({"_id": slug}, {"$set": {**body.model_dump(), "updated_at": datetime.now(UTC)}})
    return to_project(find_project(slug))


@app.patch("/projects/{slug}", response_model=Project)
def patch_project(slug: Slug, body: ProjectPatch, user_id: UserId = None):
    document = find_project(slug)
    check_owner(document, require_user(user_id))
    changes = body.model_dump(exclude_none=True)
    if "title" in changes:
        keep_version(document)  # visibility and tags aren't part of a version, the title is
    if changes:
        db.projects.update_one({"_id": slug}, {"$set": {**changes, "updated_at": datetime.now(UTC)}})
    return to_project(find_project(slug))


@app.delete("/projects/{slug}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(slug: Slug, user_id: UserId = None):
    check_owner(find_project(slug), require_user(user_id))
    db.projects.delete_one({"_id": slug})
    db.versions.delete_many({"project_id": slug})
    db.stars.delete_many({"project_id": slug})
    db.comments.delete_many({"project_id": slug})
    return Response(status_code=status.HTTP_204_NO_CONTENT)


MAX_COMMENTS = 500  # per project, to keep pages small


@app.get("/projects/{slug}/comments", response_model=list[Comment])
def list_comments(slug: Slug, user_id: UserId = None):
    document = viewable_project(slug, user_id)
    comments = db.comments.find({"project_id": slug}).sort("created_at", 1).limit(MAX_COMMENTS)
    return [to_comment(comment, document, user_id) for comment in comments]


@app.post("/projects/{slug}/comments", status_code=status.HTTP_201_CREATED, response_model=Comment)
def add_comment(slug: Slug, body: CommentInput, user_id: UserId = None, user_login: UserLogin = None):
    user = require_user(user_id)
    document = viewable_project(slug, user)
    text = body.text.strip()
    if not text:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Write something first")
    if db.comments.count_documents({"project_id": slug}) >= MAX_COMMENTS:
        raise HTTPException(status.HTTP_409_CONFLICT, "This project has too many comments")
    comment = {
        "project_id": slug,
        "user_id": user,
        "author_login": user_login,
        "text": text,
        "created_at": datetime.now(UTC),
    }
    comment["_id"] = db.comments.insert_one(comment).inserted_id
    return to_comment(comment, document, user)


@app.delete("/projects/{slug}/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_comment(slug: Slug, comment_id: str, user_id: UserId = None):
    user = require_user(user_id)
    document = viewable_project(slug, user)
    try:
        comment = db.comments.find_one({"_id": ObjectId(comment_id), "project_id": slug})
    except InvalidId:
        comment = None
    if comment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Comment not found")
    if not to_comment(comment, document, user).can_delete:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the author or the project owner can delete a comment")
    db.comments.delete_one({"_id": comment["_id"]})
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def viewable_project(slug, user_id):
    document = find_project(slug)
    if not can_view(document, user_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    return document


def to_comment(comment, project, user_id):
    can_delete = user_id is not None and user_id in (comment["user_id"], project.get("owner_id"))
    return Comment(
        id=str(comment["_id"]),
        text=comment["text"],
        author_login=comment.get("author_login"),
        created_at=comment["created_at"],
        can_delete=can_delete,
    )


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
    content = {key: version.get(key, "") for key in ("title", "files", "folders", "stdin", "args")}
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
            "args": document.get("args", ""),
            "saved_at": document["updated_at"],
            "kept_at": datetime.now(UTC),
        }
    )
    old = db.versions.find({"project_id": document["_id"]}, {"_id": 1}).sort("saved_at", -1).skip(MAX_VERSIONS)
    old_ids = [d["_id"] for d in old]
    if old_ids:
        db.versions.delete_many({"_id": {"$in": old_ids}})


def kept_version_recently(slug):
    latest = db.versions.find_one({"project_id": slug, "kept_at": {"$exists": True}}, sort=[("kept_at", -1)])
    return latest is not None and datetime.now(UTC) - latest["kept_at"].replace(tzinfo=UTC) < AUTOSAVE_VERSION_GAP


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


def can_view(document, user_id):
    return document.get("visibility", "unlisted") != "private" or document.get("owner_id") == user_id


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
