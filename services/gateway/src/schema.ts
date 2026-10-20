import type { IncomingMessage } from 'node:http';
import { createSchema } from 'graphql-yoga';
import { GraphQLError } from 'graphql';
import { createRun, getRun, grpc, isGrpcError, streamRun, type GrpcRun } from './execution.js';
import { isRateLimited } from './rateLimit.js';

const MAX_CODE_BYTES = 64 * 1024;

const languages = [
  { id: 'python', name: 'Python' },
  { id: 'javascript', name: 'JavaScript' },
  { id: 'cpp', name: 'C++' },
];

export interface Context {
  req: IncomingMessage;
}

const typeDefs = /* GraphQL */ `
  type Query {
    health: String!
    languages: [Language!]!
    run(id: ID!): Run
  }

  type Mutation {
    createRun(input: CreateRunInput!): Run!
  }

  type Subscription {
    "The current state of the run, then every update until it is finished"
    runUpdates(id: ID!): Run!
  }

  type Language {
    id: String!
    name: String!
  }

  input CreateRunInput {
    language: String!
    code: String!
    stdin: String
  }

  enum RunStatus {
    QUEUED
    COMPLETED
    TIMED_OUT
    MEMORY_EXCEEDED
    FAILED
  }

  type Run {
    id: ID!
    language: String!
    status: RunStatus!
    exitCode: Int
    stdout: String!
    stderr: String!
    truncated: Boolean!
    timeMs: Int!
    createdAt: String!
    finishedAt: String
  }
`;

function toRun(run: GrpcRun) {
  return {
    id: run.id,
    language: run.language,
    status: run.status.toUpperCase(),
    exitCode: run.exitCode ?? null,
    stdout: run.stdout ?? '',
    stderr: run.stderr ?? '',
    truncated: run.truncated ?? false,
    timeMs: run.timeMs ?? 0,
    createdAt: run.createdAt,
    finishedAt: run.finishedAt || null,
  };
}

// Turn gRPC errors into GraphQL errors the UI can understand
function toGraphQLError(error: unknown): GraphQLError {
  if (isGrpcError(error, grpc.status.INVALID_ARGUMENT)) {
    return new GraphQLError((error as grpc.ServiceError).details, {
      extensions: { code: 'BAD_USER_INPUT' },
    });
  }
  if (isGrpcError(error, grpc.status.NOT_FOUND)) {
    return new GraphQLError('Run not found', { extensions: { code: 'NOT_FOUND' } });
  }
  console.error(error);
  return new GraphQLError('Execution service is unavailable', {
    extensions: { code: 'SERVICE_UNAVAILABLE' },
  });
}

export const schema = createSchema<Context>({
  typeDefs,
  resolvers: {
    Query: {
      health: () => 'ok',
      languages: () => languages,
      run: async (_, { id }: { id: string }) => {
        try {
          return toRun(await getRun(id));
        } catch (error) {
          if (isGrpcError(error, grpc.status.NOT_FOUND)) return null;
          throw toGraphQLError(error);
        }
      },
    },

    Mutation: {
      createRun: async (
        _,
        { input }: { input: { language: string; code: string; stdin?: string } },
        { req },
      ) => {
        if (!languages.some((language) => language.id === input.language)) {
          throw new GraphQLError(`Unsupported language: ${input.language}`, {
            extensions: { code: 'BAD_USER_INPUT' },
          });
        }
        if (Buffer.byteLength(input.code) > MAX_CODE_BYTES) {
          throw new GraphQLError('Code is larger than 64 KB', {
            extensions: { code: 'BAD_USER_INPUT' },
          });
        }
        if (await isRateLimited(req.socket.remoteAddress ?? 'unknown')) {
          throw new GraphQLError('Too many runs, please wait a minute', {
            extensions: { code: 'RATE_LIMITED' },
          });
        }

        try {
          const runId = await createRun(input.language, input.code, input.stdin ?? '');
          return toRun(await getRun(runId));
        } catch (error) {
          throw toGraphQLError(error);
        }
      },
    },

    Subscription: {
      runUpdates: {
        subscribe: async function* (_, { id }: { id: string }) {
          try {
            for await (const run of streamRun(id)) {
              yield { runUpdates: toRun(run) };
            }
          } catch (error) {
            throw toGraphQLError(error);
          }
        },
      },
    },
  },
});
