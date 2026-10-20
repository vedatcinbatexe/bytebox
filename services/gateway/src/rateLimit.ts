import { Redis } from 'ioredis';

const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6380');
const LIMITS_PER_MINUTE = {
  runs: Number(process.env.RATE_LIMIT_RUNS_PER_MINUTE ?? 60),
  saves: Number(process.env.RATE_LIMIT_SAVES_PER_MINUTE ?? 30),
};

// Fixed window: count actions per user per minute
export async function isRateLimited(userId: string, action: keyof typeof LIMITS_PER_MINUTE = 'runs'): Promise<boolean> {
  const key = `ratelimit:${action}:user:${userId}`;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, 60);
  }
  return count > LIMITS_PER_MINUTE[action];
}
