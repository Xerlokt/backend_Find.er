import {
  GetCandidateMetricsUseCase,
  buildLast7Days,
} from '../../src/application/use-cases/candidate/get-candidate-metrics.use-case'
import type { ICandidateRepository } from '../../src/domain/interfaces/candidate.repository.interface'

const NOW = new Date('2026-10-22T15:00:00.000Z')

const data = (o: object = {}) => ({
  likes: 0,
  dislikes: 0,
  chatsViaMatch: 0,
  chatsViaCredit: 0,
  companiesUnlockedYou: 0,
  recentSwipes: [],
  discDominant: null,
  ...o,
})

const makeRepo = (d = data()) =>
  ({
    findByUserId: jest.fn().mockResolvedValue({ id: 'cand-1' }),
    getMetrics: jest.fn().mockResolvedValue(d),
  }) as unknown as jest.Mocked<ICandidateRepository>

describe('buildLast7Days', () => {
  it('devolve 7 dias do mais antigo ao mais novo, com zeros', () => {
    const days = buildLast7Days([], NOW)
    expect(days).toHaveLength(7)
    expect(days[0].date).toBe('2026-10-16')
    expect(days[6].date).toBe('2026-10-22')
    expect(days.every((d) => d.likes === 0 && d.dislikes === 0)).toBe(true)
  })

  it('agrupa por dia e ignora swipes fora da janela', () => {
    const days = buildLast7Days(
      [
        { direction: 'LIKE', swipedAt: new Date('2026-10-22T01:00:00Z') },
        { direction: 'LIKE', swipedAt: new Date('2026-10-22T23:59:00Z') },
        { direction: 'DISLIKE', swipedAt: new Date('2026-10-20T10:00:00Z') },
        { direction: 'LIKE', swipedAt: new Date('2026-10-01T10:00:00Z') },
      ],
      NOW,
    )
    expect(days[6]).toEqual({ date: '2026-10-22', likes: 2, dislikes: 0 })
    expect(days[4]).toEqual({ date: '2026-10-20', likes: 0, dislikes: 1 })
    expect(days.reduce((n, d) => n + d.likes + d.dislikes, 0)).toBe(3)
  })
})

describe('GetCandidateMetricsUseCase', () => {
  it('calcula totais e taxa de like', async () => {
    const repo = makeRepo(data({ likes: 3, dislikes: 1, chatsViaMatch: 2, chatsViaCredit: 1, companiesUnlockedYou: 1, discDominant: 'C' }))
    const r = await new GetCandidateMetricsUseCase(repo, () => NOW).execute('user-1')
    expect(r.swipes).toEqual({ total: 4, likes: 3, dislikes: 1, likeRate: 0.75 })
    expect(r.chats).toEqual({ total: 3, viaMatch: 2, viaCredit: 1 })
    expect(r.companiesUnlockedYou).toBe(1)
    expect(r.discDominant).toBe('C')
  })

  it('likeRate é null sem swipes', async () => {
    const r = await new GetCandidateMetricsUseCase(makeRepo(), () => NOW).execute('user-1')
    expect(r.swipes.likeRate).toBeNull()
  })

  it('consulta a janela a partir de hoje-6 dias (00:00 UTC)', async () => {
    const repo = makeRepo()
    await new GetCandidateMetricsUseCase(repo, () => NOW).execute('user-1')
    expect(repo.getMetrics).toHaveBeenCalledWith('cand-1', new Date('2026-10-16T00:00:00.000Z'))
  })

  it('404 sem perfil de candidato', async () => {
    const repo = makeRepo()
    repo.findByUserId.mockResolvedValue(null)
    await expect(new GetCandidateMetricsUseCase(repo, () => NOW).execute('user-1')).rejects.toMatchObject({ statusCode: 404 })
  })
})
