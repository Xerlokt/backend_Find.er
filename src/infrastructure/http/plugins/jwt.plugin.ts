import fp from 'fastify-plugin'
import jwtPlugin from '@fastify/jwt'
import { FastifyInstance } from 'fastify'

export default fp(async function jwtSetup(app: FastifyInstance) {
  await app.register(jwtPlugin, {
    secret: process.env.JWT_SECRET!,
    sign: {
      expiresIn: '15m',
    },
  })
})
