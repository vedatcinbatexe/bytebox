import { request } from './graphql';
import type { Project } from './project';

export interface SavedProject {
  slug: string;
  title: string;
  project: Project;
  stdin: string;
  forkedFrom: string | null;
  ownedByMe: boolean;
}

export interface ProjectSummary {
  slug: string;
  title: string;
  fileCount: number;
  updatedAt: string;
}

interface ApiProject {
  slug: string;
  title: string;
  files: { path: string; content: string }[];
  folders: string[];
  stdin: string;
  forkedFrom: string | null;
  ownedByMe: boolean;
}

export interface ProjectInput {
  title: string;
  project: Project;
  stdin: string;
}

const PROJECT_FIELDS = 'slug title files { path content } folders stdin forkedFrom ownedByMe';

function fromApi(project: ApiProject): SavedProject {
  return {
    slug: project.slug,
    title: project.title,
    project: {
      files: Object.fromEntries(project.files.map((file) => [file.path, file.content])),
      folders: project.folders,
    },
    stdin: project.stdin,
    forkedFrom: project.forkedFrom,
    ownedByMe: project.ownedByMe,
  };
}

function toApi({ title, project, stdin }: ProjectInput) {
  return {
    title: title.trim() || 'Untitled project',
    files: Object.entries(project.files).map(([path, content]) => ({ path, content })),
    folders: project.folders,
    stdin,
  };
}

export async function fetchProject(slug: string): Promise<SavedProject | null> {
  const data = await request<{ project: ApiProject | null }>(
    `query Project($slug: String!) { project(slug: $slug) { ${PROJECT_FIELDS} } }`,
    { slug },
  );
  return data.project ? fromApi(data.project) : null;
}

// Creates a new project (or a fork) owned by the signed-in user
export async function createProject(input: ProjectInput, forkedFrom?: string): Promise<SavedProject> {
  const data = await request<{ createProject: ApiProject }>(
    `mutation CreateProject($input: ProjectInput!, $forkedFrom: String) {
      createProject(input: $input, forkedFrom: $forkedFrom) { ${PROJECT_FIELDS} }
    }`,
    { input: toApi(input), forkedFrom },
  );
  return fromApi(data.createProject);
}

export async function updateProject(slug: string, input: ProjectInput): Promise<SavedProject> {
  const data = await request<{ updateProject: ApiProject }>(
    `mutation UpdateProject($slug: String!, $input: ProjectInput!) {
      updateProject(slug: $slug, input: $input) { ${PROJECT_FIELDS} }
    }`,
    { slug, input: toApi(input) },
  );
  return fromApi(data.updateProject);
}

export async function renameProject(slug: string, title: string): Promise<void> {
  await request(`mutation Rename($slug: String!, $title: String!) { renameProject(slug: $slug, title: $title) { slug } }`, {
    slug,
    title,
  });
}

export async function deleteProject(slug: string): Promise<void> {
  await request(`mutation Delete($slug: String!) { deleteProject(slug: $slug) }`, { slug });
}

export interface VersionSummary {
  id: string;
  title: string;
  fileCount: number;
  savedAt: string;
}

export async function fetchVersions(slug: string): Promise<VersionSummary[]> {
  const data = await request<{ projectVersions: VersionSummary[] }>(
    `query Versions($slug: String!) { projectVersions(slug: $slug) { id title fileCount savedAt } }`,
    { slug },
  );
  return data.projectVersions;
}

export async function fetchVersionFiles(slug: string, id: string): Promise<Record<string, string>> {
  const data = await request<{ projectVersion: { files: { path: string; content: string }[] } | null }>(
    `query Version($slug: String!, $id: ID!) { projectVersion(slug: $slug, id: $id) { files { path content } } }`,
    { slug, id },
  );
  return Object.fromEntries((data.projectVersion?.files ?? []).map((file) => [file.path, file.content]));
}

export async function restoreVersion(slug: string, id: string): Promise<SavedProject> {
  const data = await request<{ restoreProjectVersion: ApiProject }>(
    `mutation Restore($slug: String!, $id: ID!) { restoreProjectVersion(slug: $slug, id: $id) { ${PROJECT_FIELDS} } }`,
    { slug, id },
  );
  return fromApi(data.restoreProjectVersion);
}

export async function fetchMyProjects(): Promise<ProjectSummary[]> {
  const data = await request<{ myProjects: ProjectSummary[] }>(
    '{ myProjects { slug title fileCount updatedAt } }',
  );
  return data.myProjects;
}
