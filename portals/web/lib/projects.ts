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
  tags: string[];
}

export interface ProjectSummary {
  slug: string;
  title: string;
  fileCount: number;
  updatedAt: string;
  visibility: Visibility;
  ownerLogin: string | null;
  starCount: number;
  tags: string[];
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
  tags: string[];
}

export interface ProjectInput {
  title: string;
  project: Project;
  stdin: string;
}

const PROJECT_FIELDS =
  'slug title files { path content } folders stdin forkedFrom ownedByMe visibility ownerLogin starCount starredByMe tags';
const SUMMARY_FIELDS = 'slug title fileCount updatedAt visibility ownerLogin starCount tags';

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
    tags: project.tags,
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

// autosave: the project service keeps at most one version every 2 minutes
export async function updateProject(slug: string, input: ProjectInput, autosave = false): Promise<SavedProject> {
  const data = await request<{ updateProject: ApiProject }>(
    `mutation UpdateProject($slug: String!, $input: ProjectInput!, $autosave: Boolean) {
      updateProject(slug: $slug, input: $input, autosave: $autosave) { ${PROJECT_FIELDS} }
    }`,
    { slug, input: toApi(input), autosave },
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

export async function fetchExplore(sort: 'NEWEST' | 'STARS' = 'NEWEST', tag?: string): Promise<ProjectSummary[]> {
  const data = await request<{ explore: ProjectSummary[] }>(
    `query Explore($sort: ExploreSort, $tag: String) { explore(sort: $sort, tag: $tag) { ${SUMMARY_FIELDS} } }`,
    { sort, tag },
  );
  return data.explore;
}

export async function fetchPopularTags(): Promise<{ tag: string; count: number }[]> {
  const data = await request<{ popularTags: { tag: string; count: number }[] }>('{ popularTags { tag count } }');
  return data.popularTags;
}

// Replaces the project's tags; returns them cleaned up (lowercase, no duplicates)
export async function setTags(slug: string, tags: string[]): Promise<string[]> {
  const data = await request<{ setProjectTags: { tags: string[] } }>(
    `mutation Tags($slug: String!, $tags: [String!]!) { setProjectTags(slug: $slug, tags: $tags) { tags } }`,
    { slug, tags },
  );
  return data.setProjectTags.tags;
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

export interface PlatformStats {
  users: number;
  projects: number;
  publicProjects: number;
  stars: number;
  totalRuns: number;
  runsLast24h: number;
  languages: { language: string; runs: number; averageTimeMs: number }[];
  statuses: { status: string; runs: number }[];
  last7Days: { day: string; runs: number }[];
}

export async function fetchStats(): Promise<PlatformStats> {
  const data = await request<{ stats: PlatformStats }>(
    `{ stats { users projects publicProjects stars totalRuns runsLast24h
      languages { language runs averageTimeMs } statuses { status runs } last7Days { day runs } } }`,
  );
  return data.stats;
}
