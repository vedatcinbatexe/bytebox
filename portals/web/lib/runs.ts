import { request, subscribe, type GraphQLRequestError } from './graphql';

export type RunStatus = 'QUEUED' | 'COMPLETED' | 'TIMED_OUT' | 'MEMORY_EXCEEDED' | 'FAILED';

export interface Run {
  id: string;
  status: RunStatus;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  truncated: boolean;
  timeMs: number;
}

export interface Language {
  id: string;
  name: string;
}

const RUN_FIELDS = 'id status exitCode stdout stderr truncated timeMs';

export async function fetchLanguages(): Promise<Language[]> {
  const data = await request<{ languages: Language[] }>('{ languages { id name } }');
  return data.languages;
}

export async function createRun(language: string, code: string, stdin: string): Promise<Run> {
  const data = await request<{ createRun: Run }>(
    `mutation CreateRun($input: CreateRunInput!) { createRun(input: $input) { ${RUN_FIELDS} } }`,
    { input: { language, code, stdin } },
  );
  return data.createRun;
}

export function watchRun(
  id: string,
  onUpdate: (run: Run) => void,
  onError: (error: GraphQLRequestError) => void,
): () => void {
  return subscribe<{ runUpdates: Run }>(
    `subscription RunUpdates($id: ID!) { runUpdates(id: $id) { ${RUN_FIELDS} } }`,
    { id },
    (data) => onUpdate(data.runUpdates),
    onError,
  );
}
