import Fastify, { FastifyInstance } from 'fastify'
import helmetPlugin from './shared/plugins/helmet'
import corsPlugin from './shared/plugins/cors'
import jwtPlugin from './shared/plugins/jwt'
import { errorHandler } from './shared/errors/errorHandler'
import { healthRoutes } from './modules/health/health.routes'

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

  // Global error handler
  app.setErrorHandler(errorHandler)

  // Routes
  await app.register(healthRoutes)

  return app
}
