import { request } from './graphql';
import { load, save } from './storage';
import type { Project } from './project';

export interface SavedProject {
  slug: string;
  title: string;
  project: Project;
  stdin: string;
  forkedFrom: string | null;
}

interface ApiProject {
  slug: string;
  title: string;
  files: { path: string; content: string }[];
  folders: string[];
  stdin: string;
  forkedFrom: string | null;
}

export interface ProjectInput {
  title: string;
  project: Project;
  stdin: string;
}

const PROJECT_FIELDS = 'slug title files { path content } folders stdin forkedFrom';

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

// Creates a new project (or a fork) and remembers its edit token in this browser
export async function createProject(input: ProjectInput, forkedFrom?: string): Promise<SavedProject> {
  const data = await request<{ createProject: { project: ApiProject; editToken: string } }>(
    `mutation CreateProject($input: ProjectInput!, $forkedFrom: String) {
      createProject(input: $input, forkedFrom: $forkedFrom) { editToken project { ${PROJECT_FIELDS} } }
    }`,
    { input: toApi(input), forkedFrom },
  );
  const { project, editToken } = data.createProject;
  save(tokenKey(project.slug), editToken);
  return fromApi(project);
}

export async function updateProject(slug: string, input: ProjectInput): Promise<SavedProject> {
  const data = await request<{ updateProject: ApiProject }>(
    `mutation UpdateProject($slug: String!, $editToken: String!, $input: ProjectInput!) {
      updateProject(slug: $slug, editToken: $editToken, input: $input) { ${PROJECT_FIELDS} }
    }`,
    { slug, editToken: editTokenFor(slug) ?? '', input: toApi(input) },
  );
  return fromApi(data.updateProject);
}

// Only the browser that created a project has its edit token
export function editTokenFor(slug: string): string | null {
  return load(tokenKey(slug));
}

function tokenKey(slug: string): string {
  return `bytebox:token:${slug}`;
}
