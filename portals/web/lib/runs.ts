import { request, subscribe, type GraphQLRequestError } from './graphql';

export type RunStatus = 'QUEUED' | 'COMPLETED' | 'TIMED_OUT' | 'MEMORY_EXCEEDED' | 'FAILED';

export interface Run {
  id: string;
  entryFile: string;
  status: RunStatus;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  truncated: boolean;
  timeMs: number;
}

export interface ProjectFile {
  path: string;
  content: string;
}

const RUN_FIELDS = 'id entryFile status exitCode stdout stderr truncated timeMs';

export async function createRun(
  files: ProjectFile[],
  entryFile: string,
  stdin: string,
): Promise<Run> {
  const data = await request<{ createRun: Run }>(
    `mutation CreateRun($input: CreateRunInput!) { createRun(input: $input) { ${RUN_FIELDS} } }`,
    { input: { files, entryFile, stdin } },
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
