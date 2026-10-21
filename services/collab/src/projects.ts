// REST client for the project service (internal network only)
const baseUrl = process.env.PROJECT_URL ?? 'http://localhost:5003';

export interface ProjectContent {
  title: string;
  files: { path: string; content: string }[];
  folders: string[];
  stdin: string;
  args: string;
}

export interface Project extends ProjectContent {
  slug: string;
  ownerId: string | null;
  canEdit: boolean;
}

// The project as this user sees it, or null if it doesn't exist (or they can't see it)
export async function fetchProject(slug: string, userId: string): Promise<Project | null> {
  const response = await fetch(`${baseUrl}/projects/${encodeURIComponent(slug)}`, {
    headers: { 'X-User-Id': userId },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Project service error: ${response.status}`);
  return (await response.json()) as Project;
}

// Saves the live document as the owner; autosave keeps at most one history version every 2 minutes
export async function saveProject(slug: string, ownerId: string, content: ProjectContent): Promise<void> {
  const response = await fetch(`${baseUrl}/projects/${encodeURIComponent(slug)}?autosave=true`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-User-Id': ownerId },
    body: JSON.stringify(content),
  });
  if (!response.ok) throw new Error(`Saving ${slug} failed: ${response.status} ${await response.text()}`);
}
