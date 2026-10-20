from datetime import datetime
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, StringConstraints, model_validator
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


class Model(BaseModel):
    # snake_case in Python, camelCase in JSON
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class ProjectFile(Model):
    path: Path
    content: str


class ProjectInput(Model):
    title: str = Field(default="Untitled project", min_length=1, max_length=100)
    files: list[ProjectFile] = Field(min_length=1, max_length=MAX_FILES)
    folders: list[Path] = Field(default=[], max_length=MAX_FILES)
    stdin: str = Field(default="", max_length=10_000)

    @model_validator(mode="after")
    def check_files(self):
        paths = [file.path for file in self.files]
        if len(paths) != len(set(paths)):
            raise ValueError("File paths must be unique")
        if sum(len(file.content.encode()) for file in self.files) > MAX_PROJECT_BYTES:
            raise ValueError(f"The project is larger than {MAX_PROJECT_BYTES // 1024} KB")
        return self


class RenameInput(Model):
    title: str = Field(min_length=1, max_length=100)


class CreateProjectInput(ProjectInput):
    forked_from: str | None = None


class Project(ProjectInput):
    slug: str
    forked_from: str | None = None
    owner_id: str | None = None  # user id from the identity service; None for old projects made without login
    created_at: datetime
    updated_at: datetime


class ProjectSummary(Model):
    slug: str
    title: str
    file_count: int
    updated_at: datetime
