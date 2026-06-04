import { Redis } from '@upstash/redis';

// Only instantiate Redis if the env variables are present.
// Fallback to null in local dev if they haven't configured it yet.
export const redis = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
  : null;
