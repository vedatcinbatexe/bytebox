import { GraphQLError } from 'graphql';

// REST client for the project service
const baseUrl = process.env.PROJECT_URL ?? 'http://localhost:5003';

export interface ProjectInput {
  title: string;
  files: { path: string; content: string }[];
  folders: string[];
  stdin: string;
}

export interface Project extends ProjectInput {
  slug: string;
  forkedFrom: string | null;
  ownerId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectSummary {
  slug: string;
  title: string;
  fileCount: number;
  updatedAt: string;
}

// userId is only ever set by the gateway, from a verified session
async function call<T>(
  method: string,
  path: string,
  options: { body?: object; editToken?: string; userId?: string } = {},
): Promise<T | null> {
  const { body, editToken, userId } = options;
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(editToken ? { 'X-Edit-Token': editToken } : {}),
        ...(userId ? { 'X-User-Id': userId } : {}),
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
  if (response.status === 403) {
    throw new GraphQLError("You can't edit this project", { extensions: { code: 'FORBIDDEN' } });
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
  return (await response.json()) as T;
}

export function getProject(slug: string): Promise<Project | null> {
  return call<Project>('GET', `/projects/${encodeURIComponent(slug)}`);
}

export function listMyProjects(userId: string): Promise<ProjectSummary[] | null> {
  return call<ProjectSummary[]>('GET', '/projects', { userId });
}

export async function createProject(
  input: ProjectInput & { forkedFrom?: string },
  userId?: string,
): Promise<{ project: Project; editToken: string }> {
  const created = await call<{ project: Project; editToken: string }>('POST', '/projects', {
    body: input,
    userId,
  });
  if (!created) {
    throw new GraphQLError('The project to fork was not found', { extensions: { code: 'NOT_FOUND' } });
  }
  return created;
}

export async function updateProject(
  slug: string,
  input: ProjectInput,
  editToken?: string,
  userId?: string,
): Promise<Project> {
  const updated = await call<Project>('PUT', `/projects/${encodeURIComponent(slug)}`, {
    body: input,
    editToken,
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
