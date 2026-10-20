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
import {
  createProject,
  getProject,
  listMyProjects,
  updateProject,
  type Project,
  type ProjectInput,
} from './projects.js';
import type { SessionUser } from './auth.js';

const languages = [
  { id: 'python', name: 'Python', extension: '.py' },
  { id: 'javascript', name: 'JavaScript', extension: '.js' },
  { id: 'cpp', name: 'C++', extension: '.cpp' },
];

export interface Context {
  req: IncomingMessage;
  user: SessionUser | null; // from the session cookie
}

async function limitSaves(userId: string) {
  if (await isRateLimited(userId, 'saves')) {
    throw new GraphQLError('Too many saves, please wait a minute', { extensions: { code: 'RATE_LIMITED' } });
  }
}

// Running code and changing projects needs a signed-in user
function requireUser(user: SessionUser | null): SessionUser {
  if (!user) {
    throw new GraphQLError('Log in or sign up before making changes', {
      extensions: { code: 'UNAUTHENTICATED' },
    });
  }
  return user;
}

const typeDefs = /* GraphQL */ `
  type Query {
    health: String!
    languages: [Language!]!
    run(id: ID!): Run
    "A shared project, or null if the link is unknown"
    project(slug: String!): Project
    "The signed-in user, or null"
    me: User
    "Projects owned by the signed-in user, newest first"
    myProjects: [ProjectSummary!]!
  }

  type Mutation {
    createRun(input: CreateRunInput!): Run!
    "Save a new project (or a fork, with forkedFrom) owned by the signed-in user"
    createProject(input: ProjectInput!, forkedFrom: String): Project!
    "Save changes to a project you own"
    updateProject(slug: String!, input: ProjectInput!): Project!
  }

  type User {
    id: ID!
    login: String!
    name: String!
    avatarUrl: String!
  }

  type ProjectSummary {
    slug: String!
    title: String!
    fileCount: Int!
    updatedAt: String!
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
    "True when the signed-in user owns this project"
    ownedByMe: Boolean!
    createdAt: String!
    updatedAt: String!
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
  if (isGrpcError(error, grpc.status.RESOURCE_EXHAUSTED)) {
    return new GraphQLError((error as grpc.ServiceError).details, {
      extensions: { code: 'TOO_MANY_RUNS' },
    });
  }
  if (isGrpcError(error, grpc.status.UNAVAILABLE) && (error as grpc.ServiceError).details?.includes('busy')) {
    return new GraphQLError((error as grpc.ServiceError).details, { extensions: { code: 'BUSY' } });
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
      me: (_, __, { user }) => user,
      myProjects: async (_, __, { user }) => (user ? ((await listMyProjects(user.id)) ?? []) : []),
    },

    Project: {
      ownedByMe: (project: Project, _: unknown, { user }: Context) =>
        user !== null && project.ownerId === user.id,
    },

    Mutation: {
      createProject: async (
        _,
        { input, forkedFrom }: { input: ProjectInput; forkedFrom?: string },
        { user },
      ) => {
        const signedIn = requireUser(user);
        await limitSaves(signedIn.id);
        return createProject({ ...input, ...(forkedFrom ? { forkedFrom } : {}) }, signedIn.id);
      },

      updateProject: async (_, { slug, input }: { slug: string; input: ProjectInput }, { user }) => {
        const signedIn = requireUser(user);
        await limitSaves(signedIn.id);
        return updateProject(slug, input, signedIn.id);
      },

      createRun: async (
        _,
        { input }: { input: { files: ProjectFile[]; entryFile: string; stdin?: string } },
        { user },
      ) => {
        const signedIn = requireUser(user);
        // Project rules (paths, limits, language) are checked by the execution service
        if (await isRateLimited(signedIn.id)) {
          throw new GraphQLError('Too many runs, please wait a minute', {
            extensions: { code: 'RATE_LIMITED' },
          });
        }

        try {
          const runId = await createRun(input.files, input.entryFile, input.stdin ?? '', signedIn.id);
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
