import 'dotenv/config'

// Redirect to test DB before any module (including Prisma singleton) is loaded
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST!
