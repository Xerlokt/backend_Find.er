import { CandidateMetricsData, ICandidateRepository } from '../../../domain/interfaces/candidate.repository.interface'
import { DomainError } from '../../errors/domain.error'

export interface CandidateMetrics {
  swipes: { total: number; likes: number; dislikes: number; likeRate: number | null }
  chats: { total: number; viaMatch: number; viaCredit: number }
  /** empresas distintas que gastaram créditos para falar com você */
  companiesUnlockedYou: number
  /** 7 dias, do mais antigo (hoje-6) ao mais novo (hoje), UTC, zeros preenchidos */
  last7Days: { date: string; likes: number; dislikes: number }[]
  discDominant: string | null
}

const DAY_MS = 24 * 60 * 60 * 1000
const dayKey = (d: Date) => d.toISOString().slice(0, 10)

/** Começo (00:00 UTC) do primeiro dos 7 dias, para a query do repositório. */
export const metricsWindowStart = (now: Date): Date => {
  const today = new Date(`${dayKey(now)}T00:00:00.000Z`)
  return new Date(today.getTime() - 6 * DAY_MS)
}

/** Pura e testável: agrupa os swipes por dia e preenche os dias sem atividade com zero. */
export function buildLast7Days(swipes: { direction: string; swipedAt: Date }[], now: Date) {
  const start = metricsWindowStart(now)
  const days = Array.from({ length: 7 }, (_, i) => ({
    date: dayKey(new Date(start.getTime() + i * DAY_MS)),
    likes: 0,
    dislikes: 0,
  }))
  for (const s of swipes) {
    const day = days.find((d) => d.date === dayKey(s.swipedAt))
    if (!day) continue
    if (s.direction === 'LIKE') day.likes++
    else day.dislikes++
  }
  return days
}

export class GetCandidateMetricsUseCase {
  constructor(
    private readonly repo: ICandidateRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(userId: string): Promise<CandidateMetrics> {
    const profile = await this.repo.findByUserId(userId)
    if (!profile) throw new DomainError('Profile not found', 'NOT_FOUND', 404)

    const now = this.now()
    const data: CandidateMetricsData = await this.repo.getMetrics(profile.id, metricsWindowStart(now))
    const total = data.likes + data.dislikes
    return {
      swipes: {
        total,
        likes: data.likes,
        dislikes: data.dislikes,
        likeRate: total === 0 ? null : data.likes / total,
      },
      chats: { total: data.chatsViaMatch + data.chatsViaCredit, viaMatch: data.chatsViaMatch, viaCredit: data.chatsViaCredit },
      companiesUnlockedYou: data.companiesUnlockedYou,
      last7Days: buildLast7Days(data.recentSwipes, now),
      discDominant: data.discDominant,
    }
  }
}
