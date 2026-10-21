import { GraphQLError } from 'graphql';

// REST client for the project service
const baseUrl = process.env.PROJECT_URL ?? 'http://localhost:5003';

export interface ProjectInput {
  title: string;
  files: { path: string; content: string }[];
  folders: string[];
  stdin: string;
  args?: string;
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
  tags: string[];
  forkCount: number;
  forkedFromTitle: string | null;
  commentCount: number;
  canEdit: boolean;
  collaborators: { userId: string; login: string | null; joinedAt: string }[];
  inviteToken: string | null;
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
  tags: string[];
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
  if (response.status === 403 || response.status === 409 || response.status === 422) {
    // detail is our own message (a string) or FastAPI's validation errors: [{ msg, loc }]
    const { detail } = (await response.json()) as { detail: string | { msg: string }[] };
    if (response.status === 403) {
      const message = typeof detail === 'string' ? detail : 'Only the owner can change this project';
      throw new GraphQLError(message, { extensions: { code: 'FORBIDDEN' } });
    }
    const message = typeof detail === 'string' ? detail : readableMessage(detail[0]?.msg);
    throw new GraphQLError(message, { extensions: { code: 'BAD_USER_INPUT' } });
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

export async function explore(sort: 'newest' | 'stars' = 'newest', tag?: string): Promise<ProjectSummary[]> {
  const tagQuery = tag ? `&tag=${encodeURIComponent(tag)}` : '';
  return (await call<ProjectSummary[]>('GET', `/explore?limit=60&sort=${sort}${tagQuery}`)) ?? [];
}

export async function projectStats(): Promise<{ projects: number; publicProjects: number; stars: number }> {
  const stats = await call<{ projects: number; publicProjects: number; stars: number }>('GET', '/stats');
  return stats ?? { projects: 0, publicProjects: 0, stars: 0 };
}

export async function listForks(slug: string, userId?: string): Promise<ProjectSummary[]> {
  return (await call<ProjectSummary[]>('GET', `/projects/${encodeURIComponent(slug)}/forks`, { userId })) ?? [];
}

export interface Comment {
  id: string;
  text: string;
  authorLogin: string | null;
  createdAt: string;
  canDelete: boolean;
}

export async function listComments(slug: string, userId?: string): Promise<Comment[]> {
  return (await call<Comment[]>('GET', `/projects/${encodeURIComponent(slug)}/comments`, { userId })) ?? [];
}

export async function addComment(slug: string, text: string, userId: string, userLogin: string): Promise<Comment> {
  const comment = await call<Comment>('POST', `/projects/${encodeURIComponent(slug)}/comments`, {
    body: { text },
    userId,
    userLogin,
  });
  if (!comment) throw new GraphQLError('Project not found', { extensions: { code: 'NOT_FOUND' } });
  return comment;
}

export async function deleteComment(slug: string, commentId: string, userId: string): Promise<void> {
  const path = `/projects/${encodeURIComponent(slug)}/comments/${encodeURIComponent(commentId)}`;
  if (!(await call<object>('DELETE', path, { userId }))) {
    throw new GraphQLError('Comment not found', { extensions: { code: 'NOT_FOUND' } });
  }
}

// ---------- Collaborators ----------

export async function createInvite(slug: string, userId: string): Promise<string> {
  const state = await call<{ inviteToken: string }>('POST', `/projects/${encodeURIComponent(slug)}/invite`, { userId });
  if (!state) throw new GraphQLError('Project not found', { extensions: { code: 'NOT_FOUND' } });
  return state.inviteToken;
}

export async function stopInvites(slug: string, userId: string): Promise<void> {
  await call('DELETE', `/projects/${encodeURIComponent(slug)}/invite`, { userId });
}

export async function joinProject(slug: string, token: string, userId: string, userLogin: string): Promise<Project> {
  const project = await call<Project>('POST', `/projects/${encodeURIComponent(slug)}/join`, {
    body: { token },
    userId,
    userLogin,
  });
  if (!project) {
    throw new GraphQLError('This invite link is not valid anymore', { extensions: { code: 'NOT_FOUND' } });
  }
  return project;
}

export async function removeCollaborator(slug: string, collaboratorId: string, userId: string): Promise<void> {
  const path = `/projects/${encodeURIComponent(slug)}/collaborators/${encodeURIComponent(collaboratorId)}`;
  await call('DELETE', path, { userId });
}

export async function popularTags(): Promise<{ tag: string; count: number }[]> {
  return (await call<{ tag: string; count: number }[]>('GET', '/tags')) ?? [];
}

const TAG = /^[a-z0-9][a-z0-9-]{0,19}$/;
export const MAX_TAGS = 5;

export async function setTags(slug: string, tags: string[], userId: string): Promise<Project> {
  const cleaned = [...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))];
  if (cleaned.length > MAX_TAGS || !cleaned.every((tag) => TAG.test(tag))) {
    throw new GraphQLError(
      `Use up to ${MAX_TAGS} tags made of lowercase letters, numbers and "-" (at most 20 characters each)`,
      { extensions: { code: 'BAD_USER_INPUT' } },
    );
  }
  const updated = await call<Project>('PATCH', `/projects/${encodeURIComponent(slug)}`, {
    body: { tags: cleaned },
    userId,
  });
  if (!updated) throw new GraphQLError('Project not found', { extensions: { code: 'NOT_FOUND' } });
  return updated;
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
