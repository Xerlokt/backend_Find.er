import Redis from 'ioredis'
import { ICachePort } from '../../application/ports/cache.port'

export class RedisAdapter implements ICachePort {
  constructor(private readonly client: Redis) {}

  async get(key: string): Promise<string | null> {
    return this.client.get(key)
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.client.set(key, value, 'EX', ttlSeconds)
  }

  async del(key: string): Promise<void> {
    await this.client.del(key)
  }

  async invalidatePattern(pattern: string): Promise<void> {
    // SCAN + pipeline — never KEYS * (KEYS blocks the Redis event loop — see RESEARCH Pitfall 2)
    const stream = this.client.scanStream({ match: pattern, count: 100 })
    const pipeline = this.client.pipeline()
    await new Promise<void>((resolve, reject) => {
      stream.on('data', (keys: string[]) => {
        keys.forEach((key) => pipeline.del(key))
      })
      stream.on('end', () => resolve())
      stream.on('error', reject)
    })
    await pipeline.exec()
  }
}
