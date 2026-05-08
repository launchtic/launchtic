import { Redis } from "ioredis";

const url = process.env.REDIS_URL ?? "redis://localhost:6379";

// BullMQ requires maxRetriesPerRequest: null on the connection
export function createRedisConnection(): Redis {
  return new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}
