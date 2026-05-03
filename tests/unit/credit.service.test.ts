import { CreditService } from '../../src/modules/credits/credits.service'
import { CreditRepository } from '../../src/modules/credits/credits.repository'
import { AppError } from '../../src/shared/errors/AppError'
import { Prisma } from '@prisma/client'

const makeRepo = (): jest.Mocked<CreditRepository> => ({
  findRecruiterByUserId: jest.fn(),
  findJobById: jest.fn(),
  findSwipe: jest.fn(),
  findUnlock: jest.fn(),
  findCandidateProfileById: jest.fn(),
  executeUnlock: jest.fn(),
  grantCredits: jest.fn(),
} as unknown as jest.Mocked<CreditRepository>)

const makeRecruiter = (overrides: Partial<{ id: string; companyId: string; company: { id: string; plan: string; credits: number } }> = {}) => ({
  id: overrides.id ?? 'recruiter-1',
  companyId: overrides.companyId ?? 'company-1',
  company: overrides.company ?? { id: 'company-1', plan: 'FREE', credits: 10 },
})

const makeJob = (overrides: Partial<{ id: string; recruiterId: string }> = {}) => ({
  id: overrides.id ?? 'job-1',
  recruiterId: overrides.recruiterId ?? 'recruiter-1',
})

const makeSwipe = (direction: 'LIKE' | 'DISLIKE' = 'DISLIKE') => ({
  candidateId: 'candidate-1',
  jobId: 'job-1',
  direction,
})

describe('CreditService', () => {
  let repo: jest.Mocked<CreditRepository>
  let service: CreditService

  beforeEach(() => {
    repo = makeRepo()
    service = new CreditService(repo)
    jest.clearAllMocks()
  })

  describe('unlockCandidate', () => {
    it('lança 403 FORBIDDEN quando userId não tem perfil recruiter', async () => {
      repo.findRecruiterByUserId.mockResolvedValue(null)
      await expect(service.unlockCandidate('user-1', 'job-1', 'cand-1'))
        .rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' })
      expect(repo.executeUnlock).not.toHaveBeenCalled()
    })

    it('lança 404 NOT_FOUND quando job não existe', async () => {
      repo.findRecruiterByUserId.mockResolvedValue(makeRecruiter() as any)
      repo.findJobById.mockResolvedValue(null)
      await expect(service.unlockCandidate('user-1', 'job-1', 'cand-1'))
        .rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' })
    })

    it('lança 403 FORBIDDEN quando recruiter não é dono do job', async () => {
      repo.findRecruiterByUserId.mockResolvedValue(makeRecruiter({ id: 'recruiter-1' }) as any)
      repo.findJobById.mockResolvedValue(makeJob({ recruiterId: 'recruiter-OTHER' }) as any)
      await expect(service.unlockCandidate('user-1', 'job-1', 'cand-1'))
        .rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' })
    })

    it('lança 404 NOT_FOUND quando candidato não tem swipe no job', async () => {
      repo.findRecruiterByUserId.mockResolvedValue(makeRecruiter() as any)
      repo.findJobById.mockResolvedValue(makeJob() as any)
      repo.findSwipe.mockResolvedValue(null)
      await expect(service.unlockCandidate('user-1', 'job-1', 'cand-1'))
        .rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' })
    })

    it('lança 422 CANDIDATE_ALREADY_VISIBLE quando swipe é LIKE', async () => {
      repo.findRecruiterByUserId.mockResolvedValue(makeRecruiter() as any)
      repo.findJobById.mockResolvedValue(makeJob() as any)
      repo.findSwipe.mockResolvedValue(makeSwipe('LIKE') as any)
      await expect(service.unlockCandidate('user-1', 'job-1', 'cand-1'))
        .rejects.toMatchObject({ statusCode: 422, code: 'CANDIDATE_ALREADY_VISIBLE' })
    })

    it('lança 409 ALREADY_UNLOCKED quando unlock já existe', async () => {
      repo.findRecruiterByUserId.mockResolvedValue(makeRecruiter() as any)
      repo.findJobById.mockResolvedValue(makeJob() as any)
      repo.findSwipe.mockResolvedValue(makeSwipe('DISLIKE') as any)
      repo.findUnlock.mockResolvedValue({ id: 'unlock-1' } as any)
      await expect(service.unlockCandidate('user-1', 'job-1', 'cand-1'))
        .rejects.toMatchObject({ statusCode: 409, code: 'ALREADY_UNLOCKED' })
      expect(repo.executeUnlock).not.toHaveBeenCalled()
    })

    it('chama executeUnlock com cost=2 quando plano é FREE', async () => {
      repo.findRecruiterByUserId.mockResolvedValue(makeRecruiter({ company: { id: 'company-1', plan: 'FREE', credits: 10 } }) as any)
      repo.findJobById.mockResolvedValue(makeJob() as any)
      repo.findSwipe.mockResolvedValue(makeSwipe('DISLIKE') as any)
      repo.findUnlock.mockResolvedValue(null)
      repo.executeUnlock.mockResolvedValue({ id: 'unlock-1' } as any)
      await service.unlockCandidate('user-1', 'job-1', 'cand-1')
      expect(repo.executeUnlock).toHaveBeenCalledWith('company-1', 'cand-1', 'job-1', 2)
    })

    it('chama executeUnlock com cost=1 quando plano é PRO', async () => {
      repo.findRecruiterByUserId.mockResolvedValue(makeRecruiter({ company: { id: 'company-1', plan: 'PRO', credits: 5 } }) as any)
      repo.findJobById.mockResolvedValue(makeJob() as any)
      repo.findSwipe.mockResolvedValue(makeSwipe('DISLIKE') as any)
      repo.findUnlock.mockResolvedValue(null)
      repo.executeUnlock.mockResolvedValue({ id: 'unlock-1' } as any)
      await service.unlockCandidate('user-1', 'job-1', 'cand-1')
      expect(repo.executeUnlock).toHaveBeenCalledWith('company-1', 'cand-1', 'job-1', 1)
    })

    it('usa custo FREE (2) como fallback quando plano desconhecido', async () => {
      repo.findRecruiterByUserId.mockResolvedValue(makeRecruiter({ company: { id: 'company-1', plan: 'ENTERPRISE', credits: 10 } }) as any)
      repo.findJobById.mockResolvedValue(makeJob() as any)
      repo.findSwipe.mockResolvedValue(makeSwipe('DISLIKE') as any)
      repo.findUnlock.mockResolvedValue(null)
      repo.executeUnlock.mockResolvedValue({ id: 'unlock-1' } as any)
      await service.unlockCandidate('user-1', 'job-1', 'cand-1')
      expect(repo.executeUnlock).toHaveBeenCalledWith('company-1', 'cand-1', 'job-1', 2)
    })

    it('converte P2002 em 409 ALREADY_UNLOCKED (race condition)', async () => {
      repo.findRecruiterByUserId.mockResolvedValue(makeRecruiter() as any)
      repo.findJobById.mockResolvedValue(makeJob() as any)
      repo.findSwipe.mockResolvedValue(makeSwipe('DISLIKE') as any)
      repo.findUnlock.mockResolvedValue(null)
      const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint', { code: 'P2002', clientVersion: '7.0.0' })
      repo.executeUnlock.mockRejectedValue(p2002)
      await expect(service.unlockCandidate('user-1', 'job-1', 'cand-1'))
        .rejects.toMatchObject({ statusCode: 409, code: 'ALREADY_UNLOCKED' })
    })
  })

  describe('grantCredits', () => {
    it('delega para repo.grantCredits com reason admin_grant', async () => {
      repo.grantCredits.mockResolvedValue({ id: 'company-1', credits: 10 } as any)
      await service.grantCredits('company-1', 5)
      expect(repo.grantCredits).toHaveBeenCalledWith('company-1', 5, 'admin_grant')
    })

    it('lança 400 INVALID_AMOUNT quando amount é zero', async () => {
      await expect(service.grantCredits('company-1', 0))
        .rejects.toMatchObject({ statusCode: 400, code: 'INVALID_AMOUNT' })
      expect(repo.grantCredits).not.toHaveBeenCalled()
    })

    it('lança 400 INVALID_AMOUNT quando amount é negativo', async () => {
      await expect(service.grantCredits('company-1', -5))
        .rejects.toMatchObject({ statusCode: 400, code: 'INVALID_AMOUNT' })
      expect(repo.grantCredits).not.toHaveBeenCalled()
    })
  })
})
