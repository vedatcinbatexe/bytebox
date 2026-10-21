import type { IncomingMessage } from 'node:http';
import { createSchema } from 'graphql-yoga';
import { GraphQLError } from 'graphql';
import {
  createRun,
  getRun,
  listRuns,
  grpc,
  isGrpcError,
  streamRun,
  type GrpcRun,
  type ProjectFile,
} from './execution.js';
import { isRateLimited } from './rateLimit.js';
import {
  createProject,
  deleteProject,
  explore,
  publicProjectsOf,
  getVersion,
  listVersions,
  setVisibility,
  setTags,
  popularTags,
  listForks,
  listComments,
  addComment,
  deleteComment,
  setStar,
  renameProject,
  restoreVersion,
  getProject,
  listMyProjects,
  updateProject,
  type Project,
  type ProjectInput,
  type Visibility,
} from './projects.js';
import type { SessionUser } from './auth.js';
import { getPublicUser } from './identity.js';
import { platformStats } from './stats.js';

const languages = [
  { id: 'python', name: 'Python', extension: '.py' },
  { id: 'javascript', name: 'JavaScript', extension: '.js' },
  { id: 'typescript', name: 'TypeScript', extension: '.ts' },
  { id: 'java', name: 'Java', extension: '.java' },
  { id: 'cpp', name: 'C++', extension: '.cpp' },
  { id: 'go', name: 'Go', extension: '.go' },
  { id: 'rust', name: 'Rust', extension: '.rs' },
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
    "A shared project, or null if the link is unknown (or private and not yours)"
    project(slug: String!): Project
    "Public projects, newest or most starred first, optionally only those with a tag"
    explore(sort: ExploreSort = NEWEST, tag: String): [ProjectSummary!]!
    "The most used tags on public projects"
    popularTags: [TagCount!]!
    "Public numbers about Bytebox (refreshed every 30 seconds)"
    stats: PlatformStats!
    "Someone's public profile and public projects, or null if there's no such user"
    userProfile(login: String!): UserProfile
    "The signed-in user, or null"
    me: User
    "Projects owned by the signed-in user, newest first"
    myProjects: [ProjectSummary!]!
    "Runs of the signed-in user, newest first"
    myRuns(limit: Int = 20): [Run!]!
    "Earlier versions of a project you own, newest first"
    projectVersions(slug: String!): [ProjectVersion!]!
    "One earlier version with its files"
    projectVersion(slug: String!, id: ID!): ProjectVersionContent
  }

  type Mutation {
    createRun(input: CreateRunInput!): Run!
    "Save a new project (or a fork, with forkedFrom) owned by the signed-in user"
    createProject(input: ProjectInput!, forkedFrom: String): Project!
    "Save changes to a project you own"
    # autosave: keep at most one version every 2 minutes
    updateProject(slug: String!, input: ProjectInput!, autosave: Boolean = false): Project!
    "Rename a project you own"
    renameProject(slug: String!, title: String!): Project!
    "public (listed on Explore), unlisted (anyone with the link) or private (only you)"
    setProjectVisibility(slug: String!, visibility: Visibility!): Project!
    "Comment on a project you can see (1-1000 characters)"
    addComment(slug: String!, text: String!): Comment!
    "Delete your comment, or any comment on your project"
    deleteComment(slug: String!, id: ID!): Boolean!
    "Up to 5 tags like game or data-science on a project you own (replaces the old ones)"
    setProjectTags(slug: String!, tags: [String!]!): Project!
    "Star (or unstar) a project you can see"
    starProject(slug: String!, starred: Boolean!): StarState!
    "Delete a project you own (cannot be undone)"
    deleteProject(slug: String!): Boolean!
    "Make an earlier version the current one (the current one is kept in history)"
    restoreProjectVersion(slug: String!, id: ID!): Project!
  }

  type User {
    id: ID!
    login: String!
    name: String!
    avatarUrl: String!
  }

  type UserProfile {
    login: String!
    name: String!
    avatarUrl: String!
    joinedAt: String!
    projects: [ProjectSummary!]!
  }

  type ProjectVersion {
    id: ID!
    title: String!
    fileCount: Int!
    savedAt: String!
  }

  type ProjectVersionContent {
    id: ID!
    title: String!
    files: [ProjectFile!]!
    folders: [String!]!
    stdin: String!
    savedAt: String!
  }

  type ProjectSummary {
    slug: String!
    title: String!
    fileCount: Int!
    updatedAt: String!
    visibility: Visibility!
    ownerLogin: String
    starCount: Int!
    tags: [String!]!
  }

  type PlatformStats {
    users: Int!
    projects: Int!
    publicProjects: Int!
    stars: Int!
    totalRuns: Int!
    runsLast24h: Int!
    "Most used first"
    languages: [LanguageStats!]!
    statuses: [StatusCount!]!
    "Runs per day (UTC), oldest first"
    last7Days: [DayCount!]!
  }

  type LanguageStats {
    language: String!
    runs: Int!
    averageTimeMs: Int!
  }

  type StatusCount {
    status: String!
    runs: Int!
  }

  type DayCount {
    day: String!
    runs: Int!
  }

  type Comment {
    id: ID!
    text: String!
    authorLogin: String
    createdAt: String!
    "True for the author and the project owner"
    canDelete: Boolean!
  }

  type TagCount {
    tag: String!
    count: Int!
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

  enum ExploreSort {
    NEWEST
    STARS
  }

  type StarState {
    starCount: Int!
    starredByMe: Boolean!
  }

  enum Visibility {
    PUBLIC
    UNLISTED
    PRIVATE
  }

  type Project {
    slug: String!
    visibility: Visibility!
    ownerLogin: String
    starCount: Int!
    "False when signed out"
    starredByMe: Boolean!
    tags: [String!]!
    "How many projects were forked from this one"
    forkCount: Int!
    "Title of the project this was forked from (null if it's gone or private)"
    forkedFromTitle: String
    "Public forks of this project, newest first"
    forks: [ProjectSummary!]!
    commentCount: Int!
    "Oldest first"
    comments: [Comment!]!
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
    "Started; stdout/stderr hold the output so far"
    RUNNING
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
      project: (_, { slug }: { slug: string }, { user }) => getProject(slug, user?.id),
      explore: (_, { sort, tag }: { sort: 'NEWEST' | 'STARS'; tag?: string }) =>
        explore(sort === 'STARS' ? 'stars' : 'newest', tag ?? undefined),
      popularTags: () => popularTags(),
      stats: async () => {
        try {
          return await platformStats();
        } catch (error) {
          throw toGraphQLError(error);
        }
      },
      userProfile: async (_, { login }: { login: string }) => {
        const [user, projects] = await Promise.all([getPublicUser(login), publicProjectsOf(login)]);
        if (!user) return null;
        return { login: user.login, name: user.name, avatarUrl: user.avatarUrl, joinedAt: user.createdAt, projects };
      },
      me: (_, __, { user }) => user,
      myProjects: async (_, __, { user }) => (user ? ((await listMyProjects(user.id)) ?? []) : []),
      projectVersions: (_, { slug }: { slug: string }, { user }) => listVersions(slug, requireUser(user).id),
      projectVersion: (_, { slug, id }: { slug: string; id: string }, { user }) =>
        getVersion(slug, id, requireUser(user).id),
      myRuns: async (_, { limit }: { limit: number }, { user }) => {
        if (!user) return [];
        try {
          return (await listRuns(user.id, limit)).map(toRun);
        } catch (error) {
          throw toGraphQLError(error);
        }
      },
    },

    Project: {
      ownedByMe: (project: Project, _: unknown, { user }: Context) =>
        user !== null && project.ownerId === user.id,
      visibility: (project: Project) => (project.visibility ?? 'unlisted').toUpperCase(),
      forkCount: (project: Project) => project.forkCount ?? 0,
      forks: (project: Project, _: unknown, { user }: Context) => listForks(project.slug, user?.id),
      commentCount: (project: Project) => project.commentCount ?? 0,
      comments: (project: Project, _: unknown, { user }: Context) => listComments(project.slug, user?.id),
    },

    ProjectSummary: {
      visibility: (project: { visibility?: string }) => (project.visibility ?? 'unlisted').toUpperCase(),
    },

    Mutation: {
      createProject: async (
        _,
        { input, forkedFrom }: { input: ProjectInput; forkedFrom?: string },
        { user },
      ) => {
        const signedIn = requireUser(user);
        await limitSaves(signedIn.id);
        return createProject({ ...input, ...(forkedFrom ? { forkedFrom } : {}) }, signedIn.id, signedIn.login);
      },

      starProject: async (_, { slug, starred }: { slug: string; starred: boolean }, { user }) =>
        setStar(slug, starred, requireUser(user).id),

      setProjectVisibility: async (
        _,
        { slug, visibility }: { slug: string; visibility: string },
        { user },
      ) => {
        const signedIn = requireUser(user);
        await limitSaves(signedIn.id);
        return setVisibility(slug, visibility.toLowerCase() as Visibility, signedIn.id);
      },

      addComment: async (_, { slug, text }: { slug: string; text: string }, { user }) => {
        const signedIn = requireUser(user);
        await limitSaves(signedIn.id);
        if (!text.trim()) {
          throw new GraphQLError('Write something first', { extensions: { code: 'BAD_USER_INPUT' } });
        }
        if (text.length > 1000) {
          throw new GraphQLError('Comments can be at most 1000 characters', { extensions: { code: 'BAD_USER_INPUT' } });
        }
        return addComment(slug, text, signedIn.id, signedIn.login);
      },

      deleteComment: async (_, { slug, id }: { slug: string; id: string }, { user }) => {
        await deleteComment(slug, id, requireUser(user).id);
        return true;
      },

      setProjectTags: async (_, { slug, tags }: { slug: string; tags: string[] }, { user }) => {
        const signedIn = requireUser(user);
        await limitSaves(signedIn.id);
        return setTags(slug, tags, signedIn.id);
      },

      renameProject: async (_, { slug, title }: { slug: string; title: string }, { user }) => {
        const signedIn = requireUser(user);
        await limitSaves(signedIn.id);
        return renameProject(slug, title, signedIn.id);
      },

      restoreProjectVersion: async (_, { slug, id }: { slug: string; id: string }, { user }) => {
        const signedIn = requireUser(user);
        await limitSaves(signedIn.id);
        return restoreVersion(slug, id, signedIn.id);
      },

      deleteProject: async (_, { slug }: { slug: string }, { user }) => {
        const signedIn = requireUser(user);
        await limitSaves(signedIn.id);
        await deleteProject(slug, signedIn.id);
        return true;
      },

      updateProject: async (
        _,
        { slug, input, autosave }: { slug: string; input: ProjectInput; autosave?: boolean },
        { user },
      ) => {
        const signedIn = requireUser(user);
        await limitSaves(signedIn.id);
        return updateProject(slug, input, signedIn.id, autosave ?? false);
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
