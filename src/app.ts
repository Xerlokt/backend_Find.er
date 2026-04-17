import Fastify, { FastifyInstance } from 'fastify'
import helmetPlugin from './shared/plugins/helmet'
import corsPlugin from './shared/plugins/cors'
import jwtPlugin from './shared/plugins/jwt'

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

  // Error handler registered after plugins
  // (imported from shared/errors/errorHandler — created in plan 01-03)
  // Health route registered in plan 01-03

  return app
}
