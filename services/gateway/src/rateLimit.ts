import { Redis } from 'ioredis';

const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6380');
const anonymousLimit = Number(process.env.RATE_LIMIT_RUNS_PER_MINUTE ?? 20);
const signedInLimit = Number(process.env.RATE_LIMIT_RUNS_PER_MINUTE_SIGNED_IN ?? 60);

// Fixed window: count runs per minute, per user when signed in, otherwise per IP
export async function isRateLimited(ip: string, userId?: string): Promise<boolean> {
  const limitPerMinute = userId ? signedInLimit : anonymousLimit;
  const key = userId ? `ratelimit:runs:user:${userId}` : `ratelimit:runs:ip:${ip}`;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, 60);
  }
  return count > limitPerMinute;
}
