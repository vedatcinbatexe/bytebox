import { GraphQLError } from 'graphql';

// REST client for the project service
const baseUrl = process.env.PROJECT_URL ?? 'http://localhost:5003';

export interface ProjectInput {
  title: string;
  files: { path: string; content: string }[];
  folders: string[];
  stdin: string;
}

export type Visibility = 'public' | 'unlisted' | 'private';

export interface Project extends ProjectInput {
  slug: string;
  forkedFrom: string | null;
  ownerId: string | null;
  ownerLogin: string | null;
  visibility: Visibility;
  starCount: number;
  starredByMe: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectSummary {
  slug: string;
  title: string;
  fileCount: number;
  updatedAt: string;
  visibility: Visibility;
  ownerLogin: string | null;
}

// userId is only ever set by the gateway, from a verified session
async function call<T>(
  method: string,
  path: string,
  options: { body?: object; userId?: string; userLogin?: string } = {},
): Promise<T | null> {
  const { body, userId, userLogin } = options;
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(userId ? { 'X-User-Id': userId } : {}),
        ...(userLogin ? { 'X-User-Login': userLogin } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    console.error(error);
    throw new GraphQLError('Project service is unavailable', {
      extensions: { code: 'SERVICE_UNAVAILABLE' },
    });
  }

  if (response.status === 404) return null;
  if (response.status === 401) {
    throw new GraphQLError('Log in or sign up first', { extensions: { code: 'UNAUTHENTICATED' } });
  }
  if (response.status === 403) {
    throw new GraphQLError('Only the owner can change this project', { extensions: { code: 'FORBIDDEN' } });
  }
  if (response.status === 422) {
    // FastAPI validation error: { detail: [{ msg, loc }] }
    const { detail } = (await response.json()) as { detail: { msg: string }[] };
    throw new GraphQLError(readableMessage(detail[0]?.msg), {
      extensions: { code: 'BAD_USER_INPUT' },
    });
  }
  if (!response.ok) {
    throw new GraphQLError('Project service error', { extensions: { code: 'SERVICE_UNAVAILABLE' } });
  }
  if (response.status === 204) return {} as T; // e.g. DELETE: success without a body
  return (await response.json()) as T;
}

// Private projects are only returned to their owner
export function getProject(slug: string, userId?: string): Promise<Project | null> {
  return call<Project>('GET', `/projects/${encodeURIComponent(slug)}`, { userId });
}

export async function publicProjectsOf(login: string): Promise<ProjectSummary[]> {
  return (await call<ProjectSummary[]>('GET', `/users/${encodeURIComponent(login)}/projects`)) ?? [];
}

export async function explore(sort: 'newest' | 'stars' = 'newest'): Promise<ProjectSummary[]> {
  return (await call<ProjectSummary[]>('GET', `/explore?limit=60&sort=${sort}`)) ?? [];
}

export interface StarState {
  starCount: number;
  starredByMe: boolean;
}

export async function setStar(slug: string, starred: boolean, userId: string): Promise<StarState> {
  const state = await call<StarState>(starred ? 'PUT' : 'DELETE', `/projects/${encodeURIComponent(slug)}/star`, {
    userId,
  });
  if (!state) throw new GraphQLError('Project not found', { extensions: { code: 'NOT_FOUND' } });
  return state;
}

export async function setVisibility(slug: string, visibility: Visibility, userId: string): Promise<Project> {
  const updated = await call<Project>('PATCH', `/projects/${encodeURIComponent(slug)}`, {
    body: { visibility },
    userId,
  });
  if (!updated) throw new GraphQLError('Project not found', { extensions: { code: 'NOT_FOUND' } });
  return updated;
}

export interface VersionSummary {
  id: string;
  title: string;
  fileCount: number;
  savedAt: string;
}

export interface Version extends ProjectInput {
  id: string;
  savedAt: string;
}

export async function listVersions(slug: string, userId: string): Promise<VersionSummary[]> {
  return (await call<VersionSummary[]>('GET', `/projects/${encodeURIComponent(slug)}/versions`, { userId })) ?? [];
}

export function getVersion(slug: string, id: string, userId: string): Promise<Version | null> {
  return call<Version>('GET', `/projects/${encodeURIComponent(slug)}/versions/${encodeURIComponent(id)}`, { userId });
}

export async function restoreVersion(slug: string, id: string, userId: string): Promise<Project> {
  const restored = await call<Project>(
    'POST',
    `/projects/${encodeURIComponent(slug)}/versions/${encodeURIComponent(id)}/restore`,
    { userId },
  );
  if (!restored) throw new GraphQLError('Version not found', { extensions: { code: 'NOT_FOUND' } });
  return restored;
}

export function listMyProjects(userId: string): Promise<ProjectSummary[] | null> {
  return call<ProjectSummary[]>('GET', '/projects', { userId });
}

export async function createProject(
  input: ProjectInput & { forkedFrom?: string },
  userId: string,
  userLogin?: string,
): Promise<Project> {
  const created = await call<Project>('POST', '/projects', { body: input, userId, userLogin });
  if (!created) {
    throw new GraphQLError('The project to fork was not found', { extensions: { code: 'NOT_FOUND' } });
  }
  return created;
}

export async function renameProject(slug: string, title: string, userId: string): Promise<Project> {
  const renamed = await call<Project>('PATCH', `/projects/${encodeURIComponent(slug)}`, {
    body: { title },
    userId,
  });
  if (!renamed) throw new GraphQLError('Project not found', { extensions: { code: 'NOT_FOUND' } });
  return renamed;
}

export async function deleteProject(slug: string, userId: string): Promise<void> {
  const deleted = await call<object>('DELETE', `/projects/${encodeURIComponent(slug)}`, { userId });
  if (!deleted) throw new GraphQLError('Project not found', { extensions: { code: 'NOT_FOUND' } });
}

export async function updateProject(
  slug: string,
  input: ProjectInput,
  userId: string,
  autosave = false,
): Promise<Project> {
  const query = autosave ? '?autosave=true' : '';
  const updated = await call<Project>('PUT', `/projects/${encodeURIComponent(slug)}${query}`, {
    body: input,
    userId,
  });
  if (!updated) {
    throw new GraphQLError('Project not found', { extensions: { code: 'NOT_FOUND' } });
  }
  return updated;
}

// Turn Pydantic messages into something a user can understand
function readableMessage(message = ''): string {
  if (message.includes('should match pattern')) {
    return 'Invalid file or folder name. Use letters, numbers, ".", "-", "_" and "/".';
  }
  return message.replace(/^Value error, /, '') || 'Invalid project';
}
