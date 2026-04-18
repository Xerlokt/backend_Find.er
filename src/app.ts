import Fastify, { FastifyInstance } from 'fastify'
import helmetPlugin from './shared/plugins/helmet'
import corsPlugin from './shared/plugins/cors'
import jwtPlugin from './shared/plugins/jwt'
import rateLimitPlugin from './shared/plugins/rate-limit'
import { errorHandler } from './shared/errors/errorHandler'
import { healthRoutes } from './modules/health/health.routes'
import { authRoutes } from './modules/auth/auth.routes'

export interface BuildAppOptions {
  testing?: boolean
}

export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: !opts.testing,
  })

  // Security plugins registered first (SEC-07)
  await app.register(helmetPlugin)
  await app.register(corsPlugin)
  await app.register(jwtPlugin)
  await app.register(rateLimitPlugin) // rate-limit BEFORE routes (SEC-05)

  // Global error handler
  app.setErrorHandler(errorHandler)

  // Routes
  await app.register(healthRoutes)
  await app.register(authRoutes, { prefix: '/auth' })

  return app
}
