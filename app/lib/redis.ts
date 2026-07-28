import { Redis } from '@upstash/redis';
import { resolveRedisCredentials } from '@/app/lib/redis-credentials';

// Null in local dev when nothing is configured. Callers treat that as "no
// cache" and compute directly — slow, but always correct.
const credentials = resolveRedisCredentials(process.env);

export const redis = credentials ? new Redis(credentials) : null;
