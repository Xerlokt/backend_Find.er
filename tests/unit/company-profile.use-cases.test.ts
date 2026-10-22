import { UpdateCompanyUseCase } from '../../src/application/use-cases/company/update-company.use-case'
import {
  AddCompanyPhotoUseCase,
  DeleteCompanyPhotoUseCase,
  SetCompanyLogoUseCase,
  MAX_COMPANY_PHOTOS,
} from '../../src/application/use-cases/company/company-images.use-case'
import { GetCompanyStatsUseCase } from '../../src/application/use-cases/company/get-company-stats.use-case'
import type { ICompanyRepository } from '../../src/domain/interfaces/company.repository.interface'
import type { IFileStorage } from '../../src/application/ports/file-storage.port'

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)])
const TEXT = Buffer.from('not an image at all')

const makeRepo = () =>
  ({
    findById: jest.fn().mockResolvedValue({ id: 'c1', logoUrl: null }),
    recruiterBelongsToCompany: jest.fn().mockResolvedValue(true),
    update: jest.fn().mockResolvedValue({ id: 'c1' }),
    countPhotos: jest.fn().mockResolvedValue(0),
    addPhoto: jest.fn().mockResolvedValue({ id: 'p1', url: 'http://x/uploads/a.png', position: 0 }),
    findPhoto: jest.fn().mockResolvedValue({ id: 'p1', url: 'http://x/uploads/a.png', position: 0 }),
    deletePhoto: jest.fn().mockResolvedValue(undefined),
    getJobStats: jest.fn().mockResolvedValue([]),
  }) as unknown as jest.Mocked<ICompanyRepository>

const makeStorage = (): jest.Mocked<IFileStorage> => ({
  save: jest.fn().mockResolvedValue('http://x/uploads/new.png'),
  remove: jest.fn().mockResolvedValue(undefined),
})

describe('UpdateCompanyUseCase', () => {
  it('atualiza para recrutador da empresa', async () => {
    const repo = makeRepo()
    await new UpdateCompanyUseCase(repo).execute('u1', 'c1', { description: 'nova bio' })
    expect(repo.recruiterBelongsToCompany).toHaveBeenCalledWith('u1', 'c1')
    expect(repo.update).toHaveBeenCalledWith('c1', { description: 'nova bio' })
  })

  it('403 para recrutador de outra empresa', async () => {
    const repo = makeRepo()
    repo.recruiterBelongsToCompany.mockResolvedValue(false)
    await expect(new UpdateCompanyUseCase(repo).execute('u2', 'c1', { description: 'x' })).rejects.toMatchObject({ statusCode: 403 })
    expect(repo.update).not.toHaveBeenCalled()
  })

  it('404 se a empresa não existe', async () => {
    const repo = makeRepo()
    repo.findById.mockResolvedValue(null)
    await expect(new UpdateCompanyUseCase(repo).execute('u1', 'c1', {})).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('AddCompanyPhotoUseCase', () => {
  it('salva a imagem e registra a foto', async () => {
    const repo = makeRepo()
    const storage = makeStorage()
    await new AddCompanyPhotoUseCase(repo, storage).execute('u1', 'c1', PNG)
    expect(storage.save).toHaveBeenCalledWith(PNG, 'png')
    expect(repo.addPhoto).toHaveBeenCalledWith('c1', 'http://x/uploads/new.png')
  })

  it('422 INVALID_IMAGE para arquivo que não é imagem, sem gravar nada', async () => {
    const repo = makeRepo()
    const storage = makeStorage()
    await expect(new AddCompanyPhotoUseCase(repo, storage).execute('u1', 'c1', TEXT)).rejects.toMatchObject({ code: 'INVALID_IMAGE' })
    expect(storage.save).not.toHaveBeenCalled()
  })

  it('422 PHOTO_LIMIT ao passar do máximo', async () => {
    const repo = makeRepo()
    repo.countPhotos.mockResolvedValue(MAX_COMPANY_PHOTOS)
    const storage = makeStorage()
    await expect(new AddCompanyPhotoUseCase(repo, storage).execute('u1', 'c1', PNG)).rejects.toMatchObject({ code: 'PHOTO_LIMIT' })
    expect(storage.save).not.toHaveBeenCalled()
  })

  it('403 para recrutador de outra empresa', async () => {
    const repo = makeRepo()
    repo.recruiterBelongsToCompany.mockResolvedValue(false)
    await expect(new AddCompanyPhotoUseCase(repo, makeStorage()).execute('u2', 'c1', PNG)).rejects.toMatchObject({ statusCode: 403 })
  })
})

describe('DeleteCompanyPhotoUseCase', () => {
  it('apaga registro e arquivo', async () => {
    const repo = makeRepo()
    const storage = makeStorage()
    await new DeleteCompanyPhotoUseCase(repo, storage).execute('u1', 'c1', 'p1')
    expect(repo.deletePhoto).toHaveBeenCalledWith('p1')
    expect(storage.remove).toHaveBeenCalledWith('http://x/uploads/a.png')
  })

  it('404 se a foto é de outra empresa', async () => {
    const repo = makeRepo()
    repo.findPhoto.mockResolvedValue(null)
    await expect(new DeleteCompanyPhotoUseCase(repo, makeStorage()).execute('u1', 'c1', 'p9')).rejects.toMatchObject({ statusCode: 404 })
    expect(repo.deletePhoto).not.toHaveBeenCalled()
  })
})

describe('SetCompanyLogoUseCase', () => {
  it('troca o logo e apaga o arquivo anterior', async () => {
    const repo = makeRepo()
    repo.findById.mockResolvedValue({ id: 'c1', logoUrl: 'http://x/uploads/old.png' } as any)
    const storage = makeStorage()
    await new SetCompanyLogoUseCase(repo, storage).execute('u1', 'c1', PNG)
    expect(repo.update).toHaveBeenCalledWith('c1', { logoUrl: 'http://x/uploads/new.png' })
    expect(storage.remove).toHaveBeenCalledWith('http://x/uploads/old.png')
  })
})

describe('GetCompanyStatsUseCase', () => {
  const row = (o: object) => ({ jobId: 'j', title: 'T', isActive: true, createdAt: new Date(), views: 0, likes: 0, dislikes: 0, ...o })

  it('calcula taxa de like e totais', async () => {
    const repo = makeRepo()
    repo.getJobStats.mockResolvedValue([
      row({ jobId: 'a', views: 10, likes: 3, dislikes: 1 }),
      row({ jobId: 'b', views: 5, likes: 0, dislikes: 0, isActive: false }),
    ])
    const stats = await new GetCompanyStatsUseCase(repo).execute('u1', 'c1')
    expect(stats.jobs[0].likeRate).toBe(0.75)
    expect(stats.jobs[1].likeRate).toBeNull()
    expect(stats.totals).toEqual({ jobs: 2, activeJobs: 1, views: 15, likes: 3, dislikes: 1 })
  })

  it('403 para recrutador de outra empresa', async () => {
    const repo = makeRepo()
    repo.recruiterBelongsToCompany.mockResolvedValue(false)
    await expect(new GetCompanyStatsUseCase(repo).execute('u2', 'c1')).rejects.toMatchObject({ statusCode: 403 })
  })
})
