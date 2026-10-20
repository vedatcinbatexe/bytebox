import { Redis } from 'ioredis';

const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6380');
const limitPerMinute = Number(process.env.RATE_LIMIT_RUNS_PER_MINUTE ?? 60);

// Fixed window: count runs per user per minute
export async function isRateLimited(userId: string): Promise<boolean> {
  const key = `ratelimit:runs:user:${userId}`;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, 60);
  }
  return count > limitPerMinute;
}
