export interface ICachePort {
  get(key: string): Promise<string | null>
  set(key: string, value: string, ttlSeconds: number): Promise<void>
  del(key: string): Promise<void>
  invalidatePattern(pattern: string): Promise<void>
}
