import Redis from 'ioredis'

let redisClient: Redis | null = null

export function getRedisClient(): Redis {
  if (!redisClient) {
    const url = process.env.REDIS_URL ?? 'redis://localhost:6379'
    redisClient = new Redis(url)
  }
  return redisClient
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit()
    redisClient = null
  }
}
