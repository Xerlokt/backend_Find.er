import { FastifyInstance } from 'fastify'
import { AuthController } from '../../../adapters/controllers/auth.controller'

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const ctrl = new AuthController()

  app.post('/register', {
    config: { rateLimit: { max: 3, timeWindow: '1 minute' } },
  }, ctrl.register.bind(ctrl))

  app.post('/login', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, ctrl.login.bind(ctrl))

  app.post('/refresh', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, ctrl.refresh.bind(ctrl))

  app.post('/logout', ctrl.logout.bind(ctrl))

  app.post('/google', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, ctrl.loginWithGoogle.bind(ctrl))
}
