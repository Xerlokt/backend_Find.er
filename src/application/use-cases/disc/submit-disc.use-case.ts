import { IDiscRepository } from '../../../domain/interfaces/disc.repository.interface'
import { ICandidateRepository } from '../../../domain/interfaces/candidate.repository.interface'
import { DiscDimension } from '../../../domain/entities/disc-result.entity'
import { DomainError } from '../../errors/domain.error'

export class SubmitDiscUseCase {
  constructor(
    private readonly discRepo: IDiscRepository,
    private readonly candidateRepo: ICandidateRepository,
  ) {}

  async execute(
    userId: string,
    candidateId: string,
    answers: DiscDimension[],
  ): Promise<{ dominant: DiscDimension }> {
    // Authorization: JWT user must own this candidateId (D-01 business rule in application layer)
    const profile = await this.candidateRepo.findByUserId(userId)
    if (!profile || profile.id !== candidateId) {
      throw new DomainError('Forbidden', 'FORBIDDEN', 403)
    }

    // Score: count occurrences of each dimension in answers array (D-01)
    const scoreD = answers.filter(a => a === 'D').length
    const scoreI = answers.filter(a => a === 'I').length
    const scoreS = answers.filter(a => a === 'S').length
    const scoreC = answers.filter(a => a === 'C').length

    // Tie-breaking: D > I > S > C priority (D-03) — deterministic
    const maxScore = Math.max(scoreD, scoreI, scoreS, scoreC)
    let dominant: DiscDimension
    if (scoreD === maxScore) dominant = 'D'
    else if (scoreI === maxScore) dominant = 'I'
    else if (scoreS === maxScore) dominant = 'S'
    else dominant = 'C'

    // D-04: upsert — always overwrites existing result (retake allowed)
    await this.discRepo.upsert(candidateId, { scoreD, scoreI, scoreS, scoreC, dominant })
    return { dominant }
  }
}
