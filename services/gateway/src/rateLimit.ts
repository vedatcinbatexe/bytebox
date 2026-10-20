import { Redis } from 'ioredis';

const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6380');
const limitPerMinute = Number(process.env.RATE_LIMIT_RUNS_PER_MINUTE ?? 20);

// Fixed window: count runs per client per minute
export async function isRateLimited(clientId: string): Promise<boolean> {
  const key = `ratelimit:runs:${clientId}`;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, 60);
  }
  return count > limitPerMinute;
}
