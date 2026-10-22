import { ICompanyRepository } from '../../../domain/interfaces/company.repository.interface'
import { Company, CompanyPhoto } from '../../../domain/entities/company.entity'
import { IFileStorage } from '../../ports/file-storage.port'
import { DomainError } from '../../errors/domain.error'
import { detectImageType } from '../../utils/image-type'
import { assertCompanyRecruiter } from './assert-company-recruiter'

export const MAX_COMPANY_PHOTOS = 8

function extOf(data: Buffer): string {
  const ext = detectImageType(data)
  if (!ext) throw new DomainError('Envie uma imagem JPEG, PNG ou WebP', 'INVALID_IMAGE', 422)
  return ext
}

export class AddCompanyPhotoUseCase {
  constructor(private readonly repo: ICompanyRepository, private readonly storage: IFileStorage) {}

  async execute(userId: string, companyId: string, data: Buffer): Promise<CompanyPhoto> {
    await assertCompanyRecruiter(this.repo, userId, companyId)
    const ext = extOf(data)
    if ((await this.repo.countPhotos(companyId)) >= MAX_COMPANY_PHOTOS) {
      throw new DomainError(`Limite de ${MAX_COMPANY_PHOTOS} fotos por empresa`, 'PHOTO_LIMIT', 422)
    }
    const url = await this.storage.save(data, ext)
    return this.repo.addPhoto(companyId, url)
  }
}

export class DeleteCompanyPhotoUseCase {
  constructor(private readonly repo: ICompanyRepository, private readonly storage: IFileStorage) {}

  async execute(userId: string, companyId: string, photoId: string): Promise<void> {
    await assertCompanyRecruiter(this.repo, userId, companyId)
    const photo = await this.repo.findPhoto(companyId, photoId)
    if (!photo) throw new DomainError('Photo not found', 'NOT_FOUND', 404)
    await this.repo.deletePhoto(photoId)
    await this.storage.remove(photo.url)
  }
}

export class SetCompanyLogoUseCase {
  constructor(private readonly repo: ICompanyRepository, private readonly storage: IFileStorage) {}

  async execute(userId: string, companyId: string, data: Buffer): Promise<Company> {
    await assertCompanyRecruiter(this.repo, userId, companyId)
    const ext = extOf(data)
    const previous = (await this.repo.findById(companyId))?.logoUrl
    const url = await this.storage.save(data, ext)
    const company = await this.repo.update(companyId, { logoUrl: url })
    if (previous) await this.storage.remove(previous)
    return company
  }
}
