export default async function globalSetup() {
  // Override DATABASE_URL before any module (including Prisma client) is loaded.
  // This ensures the Prisma singleton connects to the test DB, not the dev/prod DB.
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST!
}
