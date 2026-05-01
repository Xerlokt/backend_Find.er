import { SwipeService } from '../../src/modules/swipe/swipe.service'
import { SwipeRepository } from '../../src/modules/swipe/swipe.repository'
import { AppError } from '../../src/shared/errors/AppError'
import { Prisma, SwipeDirection } from '@prisma/client'

// Mock do SwipeRepository — sem DB em testes unitários
const makeRepo = (): jest.Mocked<SwipeRepository> => ({
  createSwipe: jest.fn(),
  findSwipesByJobId: jest.fn(),
  findFeedJobs: jest.fn(),
  findCandidateProfileByUserId: jest.fn(),
  findRecruiterProfileByUserId: jest.fn(),
  findJobById: jest.fn(),
} as unknown as jest.Mocked<SwipeRepository>)

const makeCandidate = (overrides: Partial<{ id: string; userId: string; lat: number | null; lng: number | null }> = {}) => ({
  id: overrides.id ?? 'candidate-1',
  userId: overrides.userId ?? 'user-1',
  name: 'Test Candidate',
  lat: overrides.lat ?? null,
  lng: overrides.lng ?? null,
  bio: null,
  skills: ['Node.js'],
  professionId: 'backend-dev',
  preferredModalities: ['REMOTE'],
  salaryExpectation: null,
  user: { avatarUrl: null },
})

const makeJob = (overrides: Partial<{ id: string; recruiterId: string; isActive: boolean; lat: number | null; lng: number | null; expiresAt: Date }> = {}) => ({
  id: overrides.id ?? 'job-1',
  recruiterId: overrides.recruiterId ?? 'recruiter-profile-1',
  isActive: overrides.isActive ?? true,
  lat: overrides.lat ?? null,
  lng: overrides.lng ?? null,
  expiresAt: overrides.expiresAt ?? new Date(Date.now() + 86400000),
})

describe('SwipeService', () => {
  let repo: jest.Mocked<SwipeRepository>
  let service: SwipeService

  beforeEach(() => {
    repo = makeRepo()
    service = new SwipeService(repo)
    jest.clearAllMocks()
  })

  describe('recordSwipe', () => {
    it('lança AppError 404 NOT_FOUND quando candidato não tem perfil', async () => {
      repo.findCandidateProfileByUserId.mockResolvedValue(null)
      await expect(service.recordSwipe('user-1', 'job-1', 'LIKE')).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' })
      expect(repo.createSwipe).not.toHaveBeenCalled()
    })

    it('lança AppError 404 NOT_FOUND quando job não existe', async () => {
      repo.findCandidateProfileByUserId.mockResolvedValue(makeCandidate() as any)
      repo.findJobById.mockResolvedValue(null)
      await expect(service.recordSwipe('user-1', 'job-1', 'LIKE')).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' })
      expect(repo.createSwipe).not.toHaveBeenCalled()
    })

    it('lança AppError 404 NOT_FOUND quando job.isActive === false (D-14)', async () => {
      repo.findCandidateProfileByUserId.mockResolvedValue(makeCandidate() as any)
      repo.findJobById.mockResolvedValue(makeJob({ isActive: false }) as any)
      await expect(service.recordSwipe('user-1', 'job-1', 'LIKE')).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' })
      expect(repo.createSwipe).not.toHaveBeenCalled()
    })

    it('lança AppError 404 NOT_FOUND quando job está expirado (expiresAt <= now)', async () => {
      repo.findCandidateProfileByUserId.mockResolvedValue(makeCandidate() as any)
      repo.findJobById.mockResolvedValue(makeJob({ expiresAt: new Date(Date.now() - 1000) }) as any)
      await expect(service.recordSwipe('user-1', 'job-1', 'LIKE')).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' })
      expect(repo.createSwipe).not.toHaveBeenCalled()
    })

    it('lança AppError 409 DUPLICATE_SWIPE quando repo.createSwipe rejeita com P2002', async () => {
      repo.findCandidateProfileByUserId.mockResolvedValue(makeCandidate() as any)
      repo.findJobById.mockResolvedValue(makeJob() as any)
      const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint', { code: 'P2002', clientVersion: '7.0.0' })
      repo.createSwipe.mockRejectedValue(p2002)
      await expect(service.recordSwipe('user-1', 'job-1', 'LIKE')).rejects.toMatchObject({ statusCode: 409, code: 'DUPLICATE_SWIPE' })
    })

    it('chama repo.createSwipe com candidateId derivado do perfil (prevenção IDOR)', async () => {
      const candidate = makeCandidate({ id: 'real-candidate-id' })
      const job = makeJob()
      const swipe = { id: 'swipe-1', candidateId: 'real-candidate-id', jobId: 'job-1', direction: 'LIKE' as SwipeDirection, swipedAt: new Date() }
      repo.findCandidateProfileByUserId.mockResolvedValue(candidate as any)
      repo.findJobById.mockResolvedValue(job as any)
      repo.createSwipe.mockResolvedValue(swipe as any)
      const result = await service.recordSwipe('user-1', 'job-1', 'LIKE')
      expect(repo.createSwipe).toHaveBeenCalledWith({ candidateId: 'real-candidate-id', jobId: 'job-1', direction: 'LIKE' })
      expect(result).toEqual(swipe)
    })
  })

  describe('getFeed', () => {
    it('lança AppError 404 NOT_FOUND quando candidato não tem perfil', async () => {
      repo.findCandidateProfileByUserId.mockResolvedValue(null)
      await expect(service.getFeed('user-1', undefined, 20)).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' })
      expect(repo.findFeedJobs).not.toHaveBeenCalled()
    })

    it('chama repo.findFeedJobs com candidateId do perfil e retorna { data, nextCursor }', async () => {
      const candidate = makeCandidate({ id: 'cand-profile-id' })
      const jobs = [{ id: 'job-1', createdAt: new Date() }, { id: 'job-2', createdAt: new Date() }]
      repo.findCandidateProfileByUserId.mockResolvedValue(candidate as any)
      repo.findFeedJobs.mockResolvedValue(jobs as any)
      const result = await service.getFeed('user-1', undefined, 2)
      expect(repo.findFeedJobs).toHaveBeenCalledWith('cand-profile-id', undefined, 2)
      expect(result).toHaveProperty('data')
      expect(result).toHaveProperty('nextCursor')
    })
  })
})
