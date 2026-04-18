import fp from 'fastify-plugin'
import cors from '@fastify/cors'
import { FastifyInstance } from 'fastify'

export default fp(async function corsPlugin(app: FastifyInstance) {
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : process.env.NODE_ENV === 'production'
      ? (() => { throw new Error('ALLOWED_ORIGINS must be set in production') })()
      : ['http://localhost:3000']

  await app.register(cors, {
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    credentials: true,
  })
})
