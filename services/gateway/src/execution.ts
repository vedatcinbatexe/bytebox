import { fileURLToPath } from 'node:url';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';

// Shared contract in the repo root: proto/execution.proto
const protoPath = fileURLToPath(new URL('../../../proto/execution.proto', import.meta.url));
const address = process.env.EXECUTION_GRPC_ADDRESS ?? 'localhost:50051';

// Shape of the Run message from execution.proto (fields are camelCased by proto-loader)
export interface GrpcRun {
  id: string;
  language: string;
  status: string;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  truncated?: boolean;
  timeMs?: number;
  createdAt: string;
  finishedAt?: string;
  entryFile?: string;
}

export interface ProjectFile {
  path: string;
  content: string;
}

const definition = protoLoader.loadSync(protoPath, { keepCase: false, defaults: false });
const proto = grpc.loadPackageDefinition(definition) as any;
const client = new proto.bytebox.execution.v1.ExecutionService(
  address,
  grpc.credentials.createInsecure(),
);

function unary<T>(method: string, request: object): Promise<T> {
  return new Promise((resolve, reject) => {
    client[method](request, (error: grpc.ServiceError | null, response: T) =>
      error ? reject(error) : resolve(response),
    );
  });
}

export async function createRun(
  files: ProjectFile[],
  entryFile: string,
  stdin: string,
): Promise<string> {
  const response = await unary<{ runId: string }>('CreateRun', { files, entryFile, stdin });
  return response.runId;
}

export function getRun(runId: string): Promise<GrpcRun> {
  return unary<GrpcRun>('GetRun', { runId });
}

// Yields the current state of the run, then every update until it is finished
export async function* streamRun(runId: string): AsyncGenerator<GrpcRun> {
  const call: grpc.ClientReadableStream<GrpcRun> = client.StreamRun({ runId });
  try {
    for await (const run of call) {
      yield run;
    }
  } finally {
    call.cancel(); // stop the gRPC stream when the client disconnects
  }
}

export function isGrpcError(error: unknown, code: grpc.status): boolean {
  return (error as grpc.ServiceError)?.code === code;
}

export { grpc };
