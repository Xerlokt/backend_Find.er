import fp from 'fastify-plugin'
import jwtPlugin from '@fastify/jwt'
import { FastifyInstance } from 'fastify'

export default fp(async function jwtSetup(app: FastifyInstance) {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required')
  }
  await app.register(jwtPlugin, {
    secret,
    sign: {
      expiresIn: '15m',
    },
  })
})
