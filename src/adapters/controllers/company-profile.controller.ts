import { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { CompanyRepository } from '../repositories/company.repository'
import { IFileStorage } from '../../application/ports/file-storage.port'
import { DomainError } from '../../application/errors/domain.error'
import { UpdateCompanyUseCase } from '../../application/use-cases/company/update-company.use-case'
import {
  AddCompanyPhotoUseCase,
  DeleteCompanyPhotoUseCase,
  SetCompanyLogoUseCase,
} from '../../application/use-cases/company/company-images.use-case'
import { GetCompanyStatsUseCase } from '../../application/use-cases/company/get-company-stats.use-case'

const ParamsSchema = z.object({ id: z.string().uuid() })
const PhotoParamsSchema = z.object({ id: z.string().uuid(), photoId: z.string().uuid() })

// string vazia limpa o campo
const UpdateSchema = z
  .object({
    description: z.string().trim().max(1000).transform((v) => (v === '' ? null : v)).nullable().optional(),
    tradeName: z.string().trim().max(150).transform((v) => (v === '' ? null : v)).nullable().optional(),
  })
  .strict()

export class CompanyProfileController {
  private readonly repo = new CompanyRepository()

  constructor(private readonly storage: IFileStorage) {}

  async update(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = ParamsSchema.parse(request.params)
    const body = UpdateSchema.parse(request.body)
    const result = await new UpdateCompanyUseCase(this.repo).execute(request.user.id, id, body)
    reply.status(200).send(result)
  }

  async addPhoto(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = ParamsSchema.parse(request.params)
    const data = await this.readFile(request)
    const photo = await new AddCompanyPhotoUseCase(this.repo, this.storage).execute(request.user.id, id, data)
    reply.status(201).send(photo)
  }

  async deletePhoto(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id, photoId } = PhotoParamsSchema.parse(request.params)
    await new DeleteCompanyPhotoUseCase(this.repo, this.storage).execute(request.user.id, id, photoId)
    reply.status(204).send()
  }

  async setLogo(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = ParamsSchema.parse(request.params)
    const data = await this.readFile(request)
    const company = await new SetCompanyLogoUseCase(this.repo, this.storage).execute(request.user.id, id, data)
    reply.status(200).send(company)
  }

  async stats(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = ParamsSchema.parse(request.params)
    reply.status(200).send(await new GetCompanyStatsUseCase(this.repo).execute(request.user.id, id))
  }

  private async readFile(request: FastifyRequest): Promise<Buffer> {
    const part = await request.file()
    if (!part) throw new DomainError('Envie o arquivo no campo "file"', 'FILE_REQUIRED', 400)
    try {
      return await part.toBuffer()
    } catch (err: any) {
      if (err?.code === 'FST_REQ_FILE_TOO_LARGE') throw new DomainError('Imagem maior que 5 MB', 'FILE_TOO_LARGE', 413)
      throw err
    }
  }
}
