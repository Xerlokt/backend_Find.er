import 'dotenv/config'

// Redirect to test DB before any module (including Prisma singleton) is loaded
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST!

// Set Redis test URL — overridden in setup.ts to use redis_test (port 6380)
// Fallback ensures tests that don't import setup.ts don't fail on missing env var
if (!process.env.REDIS_URL_TEST) {
  process.env.REDIS_URL_TEST = 'redis://localhost:6380'
}
