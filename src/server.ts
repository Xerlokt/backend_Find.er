import 'dotenv/config'
import { buildApp } from './app'

const requiredEnv = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'DATABASE_URL', 'NEO4J_URI', 'NEO4J_USER', 'NEO4J_PASSWORD']
for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}`)
    process.exit(1)
  }
}

async function main() {
  const app = await buildApp()
  const port = Number(process.env.PORT ?? 3000)

  await app.listen({ port, host: '0.0.0.0' })
  console.log(`Server running on port ${port}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
