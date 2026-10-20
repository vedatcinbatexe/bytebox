// Numbers from every service for the public stats page
import { getRunStats } from './execution.js';
import { getUserCount } from './identity.js';
import { projectStats } from './projects.js';

export interface PlatformStats {
  users: number;
  projects: number;
  publicProjects: number;
  stars: number;
  totalRuns: number;
  runsLast24h: number;
  languages: { language: string; runs: number; averageTimeMs: number }[];
  statuses: { status: string; runs: number }[];
  last7Days: { day: string; runs: number }[];
}

// The page is public, so keep the answer for a while instead of counting on every visit
const CACHE_MS = 30_000;
let cached: { stats: PlatformStats; at: number } | null = null;

export async function platformStats(): Promise<PlatformStats> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.stats;

  const [users, projects, runs] = await Promise.all([getUserCount(), projectStats(), getRunStats()]);
  const stats: PlatformStats = {
    users,
    ...projects,
    // gRPC leaves out zero numbers, so put them back
    totalRuns: runs.totalRuns ?? 0,
    runsLast24h: runs.runsLast_24h ?? 0,
    languages: (runs.languages ?? []).map((item) => ({
      language: item.language,
      runs: item.runs ?? 0,
      averageTimeMs: item.averageTimeMs ?? 0,
    })),
    statuses: (runs.statuses ?? []).map((item) => ({ status: item.status, runs: item.runs ?? 0 })),
    last7Days: (runs.last_7Days ?? []).map((item) => ({ day: item.day, runs: item.runs ?? 0 })),
  };
  cached = { stats, at: Date.now() };
  return stats;
}
