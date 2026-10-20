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

export async function fetchMyProjects(): Promise<ProjectSummary[]> {
  const data = await request<{ myProjects: ProjectSummary[] }>(
    '{ myProjects { slug title fileCount updatedAt } }',
  );
  return data.myProjects;
}
