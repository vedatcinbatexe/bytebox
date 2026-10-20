import type { IncomingMessage } from 'node:http';
import { createSchema } from 'graphql-yoga';
import { GraphQLError } from 'graphql';
import {
  createRun,
  getRun,
  grpc,
  isGrpcError,
  streamRun,
  type GrpcRun,
  type ProjectFile,
} from './execution.js';
import { isRateLimited } from './rateLimit.js';
import { createProject, getProject, updateProject, type ProjectInput } from './projects.js';

const languages = [
  { id: 'python', name: 'Python', extension: '.py' },
  { id: 'javascript', name: 'JavaScript', extension: '.js' },
  { id: 'cpp', name: 'C++', extension: '.cpp' },
];

export interface Context {
  req: IncomingMessage;
}

const typeDefs = /* GraphQL */ `
  type Query {
    health: String!
    languages: [Language!]!
    run(id: ID!): Run
    "A shared project, or null if the link is unknown"
    project(slug: String!): Project
  }

  type Mutation {
    createRun(input: CreateRunInput!): Run!
    "Save a new project (or a fork, with forkedFrom). Keep the editToken: it is needed to save changes."
    createProject(input: ProjectInput!, forkedFrom: String): SavedProject!
    "Save changes to a project you created"
    updateProject(slug: String!, editToken: String!, input: ProjectInput!): Project!
  }

  type Subscription {
    "The current state of the run, then every update until it is finished"
    runUpdates(id: ID!): Run!
  }

  type Language {
    id: String!
    name: String!
    "File extension that runs with this language, e.g. .py"
    extension: String!
  }

  input FileInput {
    "Relative path, e.g. utils/greet.py"
    path: String!
    content: String!
  }

  input CreateRunInput {
    "All files of the project"
    files: [FileInput!]!
    "Path of the file to run; its extension decides the language"
    entryFile: String!
    stdin: String
  }

  type ProjectFile {
    path: String!
    content: String!
  }

  type Project {
    slug: String!
    title: String!
    files: [ProjectFile!]!
    folders: [String!]!
    stdin: String!
    forkedFrom: String
    createdAt: String!
    updatedAt: String!
  }

  type SavedProject {
    project: Project!
    editToken: String!
  }

  input ProjectInput {
    title: String!
    files: [FileInput!]!
    folders: [String!]!
    stdin: String!
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
    entryFile: String!
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
    entryFile: run.entryFile ?? '',
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
      project: (_, { slug }: { slug: string }) => getProject(slug),
    },

    Mutation: {
      createProject: (_, { input, forkedFrom }: { input: ProjectInput; forkedFrom?: string }) =>
        createProject({ ...input, ...(forkedFrom ? { forkedFrom } : {}) }),

      updateProject: (
        _,
        { slug, editToken, input }: { slug: string; editToken: string; input: ProjectInput },
      ) => updateProject(slug, editToken, input),

      createRun: async (
        _,
        { input }: { input: { files: ProjectFile[]; entryFile: string; stdin?: string } },
        { req },
      ) => {
        // Project rules (paths, limits, language) are checked by the execution service
        if (await isRateLimited(req.socket.remoteAddress ?? 'unknown')) {
          throw new GraphQLError('Too many runs, please wait a minute', {
            extensions: { code: 'RATE_LIMITED' },
          });
        }

        try {
          const runId = await createRun(input.files, input.entryFile, input.stdin ?? '');
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
