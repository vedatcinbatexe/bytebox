from datetime import datetime
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, BeforeValidator, ConfigDict, Field, StringConstraints, model_validator
from pydantic.alias_generators import to_camel

# Same rules as the execution service and runner
MAX_FILES = 50
MAX_PROJECT_BYTES = 256 * 1024
SAFE_PATH = r"^[A-Za-z0-9_.-]+(/[A-Za-z0-9_.-]+)*$"


def no_parent_folders(path: str) -> str:
    if ".." in path.split("/"):
        raise ValueError("Path must not contain '..'")
    return path


Path = Annotated[
    str,
    StringConstraints(max_length=200, pattern=SAFE_PATH),
    AfterValidator(no_parent_folders),
]


# A tag is a short lowercase word like "game" or "data-science"
MAX_TAGS = 5
Tag = Annotated[
    str,
    BeforeValidator(lambda tag: tag.strip().lower() if isinstance(tag, str) else tag),
    StringConstraints(pattern=r"^[a-z0-9][a-z0-9-]{0,19}$"),
]


def unique(tags: list[str]) -> list[str]:
    return list(dict.fromkeys(tags))


class Model(BaseModel):
    # snake_case in Python, camelCase in JSON
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class ProjectFile(Model):
    path: Path
    content: str


# public: listed on Explore · unlisted: anyone with the link · private: only the owner
Visibility = Literal["public", "unlisted", "private"]


class ProjectInput(Model):
    title: str = Field(default="Untitled project", min_length=1, max_length=100)
    files: list[ProjectFile] = Field(min_length=1, max_length=MAX_FILES)
    folders: list[Path] = Field(default=[], max_length=MAX_FILES)
    stdin: str = Field(default="", max_length=10_000)
    args: str = Field(default="", max_length=1000)  # command-line arguments as typed

    @model_validator(mode="after")
    def check_files(self):
        paths = [file.path for file in self.files]
        if len(paths) != len(set(paths)):
            raise ValueError("File paths must be unique")
        if sum(len(file.content.encode()) for file in self.files) > MAX_PROJECT_BYTES:
            raise ValueError(f"The project is larger than {MAX_PROJECT_BYTES // 1024} KB")
        return self


class ProjectPatch(Model):
    """Change the title, visibility and/or tags without touching the files."""

    title: str | None = Field(default=None, min_length=1, max_length=100)
    visibility: Visibility | None = None
    tags: Annotated[list[Tag], AfterValidator(unique)] | None = Field(default=None, max_length=MAX_TAGS)


class VersionSummary(Model):
    id: str
    title: str
    file_count: int
    saved_at: datetime


class Version(ProjectInput):
    id: str
    saved_at: datetime


class CreateProjectInput(ProjectInput):
    forked_from: str | None = None
    visibility: Visibility = "unlisted"


class Collaborator(Model):
    user_id: str
    login: str | None = None
    joined_at: datetime


class Project(ProjectInput):
    slug: str
    forked_from: str | None = None
    owner_id: str | None = None  # user id from the identity service; None for old projects made without login
    owner_login: str | None = None  # shown on Explore and profiles
    visibility: Visibility = "unlisted"
    star_count: int = 0
    starred_by_me: bool = False
    tags: list[str] = []
    fork_count: int = 0
    comment_count: int = 0
    # Live collaboration: people the owner invited can edit and save too
    can_edit: bool = False
    collaborators: list[Collaborator] = []  # only shown to people who can edit
    invite_token: str | None = None  # only shown to the owner
    forked_from_title: str | None = None  # None when the original is gone or private
    created_at: datetime
    updated_at: datetime


class ProjectSummary(Model):
    slug: str
    title: str
    file_count: int
    updated_at: datetime
    visibility: Visibility = "unlisted"
    owner_login: str | None = None
    star_count: int = 0
    tags: list[str] = []


class JoinInput(Model):
    token: str = Field(min_length=1, max_length=100)


class InviteState(Model):
    invite_token: str | None


class CommentInput(Model):
    text: str = Field(min_length=1, max_length=1000)


class Comment(Model):
    id: str
    text: str
    author_login: str | None = None
    created_at: datetime
    can_delete: bool = False  # the author or the project owner


class ProjectStats(Model):
    projects: int
    public_projects: int
    stars: int


class TagCount(Model):
    tag: str
    count: int


class StarState(Model):
    star_count: int
    starred_by_me: bool
