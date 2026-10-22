import { SubmitDiscUseCase } from '../../src/application/use-cases/disc/submit-disc.use-case'
import { GetDiscUseCase } from '../../src/application/use-cases/disc/get-disc.use-case'
import { IDiscRepository } from '../../src/domain/interfaces/disc.repository.interface'
import { ICandidateRepository } from '../../src/domain/interfaces/candidate.repository.interface'
import { DiscResult } from '../../src/domain/entities/disc-result.entity'

const makeDiscRepo = (): jest.Mocked<IDiscRepository> => ({
  upsert: jest.fn(),
  findByCandidateId: jest.fn(),
})

const makeCandidateRepo = (): jest.Mocked<ICandidateRepository> => ({
  upsertProfile: jest.fn(),
  findByUserId: jest.fn(),
  getMetrics: jest.fn(),
})

const makeCandidateProfile = (overrides = {}) => ({
  id: 'candidate-1',
  userId: 'user-1',
  name: 'Test Candidate',
  bio: null,
  lat: null,
  lng: null,
  professionId: 'prof-1',
  skills: [],
  preferredModalities: [],
  searchRadiusKm: 50,
  salaryExpectation: null,
  ...overrides,
})

const makeDiscResult = (overrides = {}): DiscResult => ({
  id: 'disc-1',
  candidateId: 'candidate-1',
  scoreD: 4,
  scoreI: 0,
  scoreS: 0,
  scoreC: 0,
  dominant: 'D',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

describe('SubmitDiscUseCase', () => {
  beforeEach(() => jest.clearAllMocks())

  it('scores correctly — all D answers produce dominant D', async () => {
    const discRepo = makeDiscRepo()
    const candidateRepo = makeCandidateRepo()
    candidateRepo.findByUserId.mockResolvedValue(makeCandidateProfile() as any)
    discRepo.upsert.mockResolvedValue(makeDiscResult())

    const uc = new SubmitDiscUseCase(discRepo, candidateRepo)
    const result = await uc.execute('user-1', 'candidate-1', ['D', 'D', 'D', 'D'])

    expect(result.dominant).toBe('D')
    expect(discRepo.upsert).toHaveBeenCalledWith('candidate-1', {
      scoreD: 4,
      scoreI: 0,
      scoreS: 0,
      scoreC: 0,
      dominant: 'D',
    })
  })

  it('tie-break D>I — D=2, I=2 → dominant D (D-03)', async () => {
    const discRepo = makeDiscRepo()
    const candidateRepo = makeCandidateRepo()
    candidateRepo.findByUserId.mockResolvedValue(makeCandidateProfile() as any)
    discRepo.upsert.mockResolvedValue(makeDiscResult({ dominant: 'D', scoreD: 2, scoreI: 2 }))

    const uc = new SubmitDiscUseCase(discRepo, candidateRepo)
    const result = await uc.execute('user-1', 'candidate-1', ['D', 'I', 'D', 'I'])

    expect(result.dominant).toBe('D')
    expect(discRepo.upsert).toHaveBeenCalledWith('candidate-1', {
      scoreD: 2,
      scoreI: 2,
      scoreS: 0,
      scoreC: 0,
      dominant: 'D',
    })
  })

  it('S wins when S=2, others=1 — no tie', async () => {
    const discRepo = makeDiscRepo()
    const candidateRepo = makeCandidateRepo()
    candidateRepo.findByUserId.mockResolvedValue(makeCandidateProfile() as any)
    discRepo.upsert.mockResolvedValue(makeDiscResult({ dominant: 'S', scoreI: 1, scoreS: 2, scoreC: 1, scoreD: 0 }))

    const uc = new SubmitDiscUseCase(discRepo, candidateRepo)
    const result = await uc.execute('user-1', 'candidate-1', ['I', 'S', 'C', 'S'])

    expect(result.dominant).toBe('S')
  })

  it('throws FORBIDDEN (403) when candidateRepo returns null (no profile)', async () => {
    const discRepo = makeDiscRepo()
    const candidateRepo = makeCandidateRepo()
    candidateRepo.findByUserId.mockResolvedValue(null)

    const uc = new SubmitDiscUseCase(discRepo, candidateRepo)
    await expect(uc.execute('user-1', 'candidate-1', ['D', 'D', 'D', 'D'])).rejects.toMatchObject({
      code: 'FORBIDDEN',
      statusCode: 403,
    })
  })

  it('throws FORBIDDEN (403) when profile.id does not match candidateId param', async () => {
    const discRepo = makeDiscRepo()
    const candidateRepo = makeCandidateRepo()
    candidateRepo.findByUserId.mockResolvedValue(makeCandidateProfile({ id: 'candidate-OTHER' }) as any)

    const uc = new SubmitDiscUseCase(discRepo, candidateRepo)
    await expect(uc.execute('user-1', 'candidate-1', ['D', 'D', 'D', 'D'])).rejects.toMatchObject({
      code: 'FORBIDDEN',
      statusCode: 403,
    })
  })
})

describe('GetDiscUseCase', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns dominant when result exists', async () => {
    const discRepo = makeDiscRepo()
    const candidateRepo = makeCandidateRepo()
    candidateRepo.findByUserId.mockResolvedValue(makeCandidateProfile() as any)
    discRepo.findByCandidateId.mockResolvedValue(makeDiscResult({ dominant: 'I' }))

    const uc = new GetDiscUseCase(discRepo, candidateRepo)
    const result = await uc.execute('user-1', 'candidate-1')

    expect(result.dominant).toBe('I')
  })

  it('throws NOT_FOUND (404) when no disc result exists', async () => {
    const discRepo = makeDiscRepo()
    const candidateRepo = makeCandidateRepo()
    candidateRepo.findByUserId.mockResolvedValue(makeCandidateProfile() as any)
    discRepo.findByCandidateId.mockResolvedValue(null)

    const uc = new GetDiscUseCase(discRepo, candidateRepo)
    await expect(uc.execute('user-1', 'candidate-1')).rejects.toMatchObject({
      code: 'NOT_FOUND',
      statusCode: 404,
    })
  })

  it('throws FORBIDDEN (403) when user does not own candidateId', async () => {
    const discRepo = makeDiscRepo()
    const candidateRepo = makeCandidateRepo()
    candidateRepo.findByUserId.mockResolvedValue(makeCandidateProfile({ id: 'candidate-OTHER' }) as any)

    const uc = new GetDiscUseCase(discRepo, candidateRepo)
    await expect(uc.execute('user-1', 'candidate-1')).rejects.toMatchObject({
      code: 'FORBIDDEN',
      statusCode: 403,
    })
  })
})
