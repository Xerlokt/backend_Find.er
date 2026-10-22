import fp from 'fastify-plugin'
import helmet from '@fastify/helmet'
import { FastifyInstance } from 'fastify'

export default fp(async function helmetPlugin(app: FastifyInstance) {
  await app.register(helmet, {
    // o site do recrutador (outra origem) precisa carregar as imagens de /uploads
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: process.env.NODE_ENV === 'production'
      ? undefined  // use helmet defaults in production
      : false,     // disabled in dev to allow Vite/HMR etc.
  })
})
