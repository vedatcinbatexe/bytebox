import { request } from './graphql';
import type { Project } from './project';

export type Visibility = 'PUBLIC' | 'UNLISTED' | 'PRIVATE';

export const VISIBILITY: Record<Visibility, { icon: string; label: string; help: string }> = {
  PUBLIC: { icon: '🌍', label: 'Public', help: 'Anyone can find it on Explore' },
  UNLISTED: { icon: '🔗', label: 'Unlisted', help: 'Anyone with the link can open it' },
  PRIVATE: { icon: '🔒', label: 'Private', help: 'Only you can open it' },
};

export interface SavedProject {
  slug: string;
  title: string;
  project: Project;
  stdin: string;
  forkedFrom: string | null;
  ownedByMe: boolean;
  visibility: Visibility;
  ownerLogin: string | null;
  starCount: number;
  starredByMe: boolean;
}

export interface ProjectSummary {
  slug: string;
  title: string;
  fileCount: number;
  updatedAt: string;
  visibility: Visibility;
  ownerLogin: string | null;
  starCount: number;
}

interface ApiProject {
  slug: string;
  title: string;
  files: { path: string; content: string }[];
  folders: string[];
  stdin: string;
  forkedFrom: string | null;
  ownedByMe: boolean;
  visibility: Visibility;
  ownerLogin: string | null;
  starCount: number;
  starredByMe: boolean;
}

export interface ProjectInput {
  title: string;
  project: Project;
  stdin: string;
}

const PROJECT_FIELDS =
  'slug title files { path content } folders stdin forkedFrom ownedByMe visibility ownerLogin starCount starredByMe';
const SUMMARY_FIELDS = 'slug title fileCount updatedAt visibility ownerLogin starCount';

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
    visibility: project.visibility,
    ownerLogin: project.ownerLogin,
    starCount: project.starCount,
    starredByMe: project.starredByMe,
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
    `{ myProjects { ${SUMMARY_FIELDS} } }`,
  );
  return data.myProjects;
}

export interface UserProfile {
  login: string;
  name: string;
  avatarUrl: string;
  joinedAt: string;
  projects: ProjectSummary[];
}

export async function fetchProfile(login: string): Promise<UserProfile | null> {
  const data = await request<{ userProfile: UserProfile | null }>(
    `query Profile($login: String!) { userProfile(login: $login) { login name avatarUrl joinedAt projects { ${SUMMARY_FIELDS} } } }`,
    { login },
  );
  return data.userProfile;
}

export async function fetchExplore(sort: 'NEWEST' | 'STARS' = 'NEWEST'): Promise<ProjectSummary[]> {
  const data = await request<{ explore: ProjectSummary[] }>(
    `query Explore($sort: ExploreSort) { explore(sort: $sort) { ${SUMMARY_FIELDS} } }`,
    { sort },
  );
  return data.explore;
}

export async function setStar(slug: string, starred: boolean): Promise<{ starCount: number; starredByMe: boolean }> {
  const data = await request<{ starProject: { starCount: number; starredByMe: boolean } }>(
    `mutation Star($slug: String!, $starred: Boolean!) { starProject(slug: $slug, starred: $starred) { starCount starredByMe } }`,
    { slug, starred },
  );
  return data.starProject;
}

export async function setVisibility(slug: string, visibility: Visibility): Promise<void> {
  await request(
    `mutation Visibility($slug: String!, $visibility: Visibility!) { setProjectVisibility(slug: $slug, visibility: $visibility) { slug } }`,
    { slug, visibility },
  );
}
