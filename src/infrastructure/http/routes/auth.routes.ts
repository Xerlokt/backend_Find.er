import { FastifyInstance } from 'fastify'
import { ICnpjLookupPort } from '../../../application/ports/cnpj-lookup.port'
import { AuthController } from '../../../adapters/controllers/auth.controller'

export interface AuthRoutesOptions {
  cnpjLookup?: ICnpjLookupPort
}

export async function authRoutes(app: FastifyInstance, opts: AuthRoutesOptions = {}): Promise<void> {
  const ctrl = new AuthController(undefined, undefined, undefined, opts.cnpjLookup)

  app.post('/register', {
    config: { rateLimit: { max: 3, timeWindow: '1 minute' } },
  }, ctrl.register.bind(ctrl))

  app.post('/register-company', {
    config: { rateLimit: { max: 3, timeWindow: '1 minute' } },
  }, ctrl.registerCompany.bind(ctrl))

  app.get('/cnpj/:cnpj', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, ctrl.previewCnpj.bind(ctrl))

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
