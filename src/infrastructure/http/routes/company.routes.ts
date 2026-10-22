import { FastifyInstance } from 'fastify'
import { CompanyController } from '../../../adapters/controllers/company.controller'
import { CompanyProfileController } from '../../../adapters/controllers/company-profile.controller'
import { authenticate } from '../plugins/authenticate.hook'
import { requireRole } from '../plugins/require-role.hook'
import { IFileStorage } from '../../../application/ports/file-storage.port'

export async function companyRoutes(app: FastifyInstance, opts: { storage: IFileStorage }): Promise<void> {
  const ctrl = new CompanyController()
  const profile = new CompanyProfileController(opts.storage)
  const recruiter = { preHandler: [authenticate, requireRole('RECRUITER')] }

  app.post('/', { preHandler: [authenticate, requireRole('ADMIN')] }, ctrl.create.bind(ctrl))
  app.get('/:id', { preHandler: [authenticate] }, ctrl.getById.bind(ctrl))

  // perfil, galeria e estatísticas: só recrutadores da própria empresa (checado no use case)
  app.patch('/:id', recruiter, profile.update.bind(profile))
  app.post('/:id/logo', recruiter, profile.setLogo.bind(profile))
  app.post('/:id/photos', recruiter, profile.addPhoto.bind(profile))
  app.delete('/:id/photos/:photoId', recruiter, profile.deletePhoto.bind(profile))
  app.get('/:id/stats', recruiter, profile.stats.bind(profile))
}
