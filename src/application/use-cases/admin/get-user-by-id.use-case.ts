import { IUserRepository, UserPublic } from '../../../domain/interfaces/user.repository.interface'
import { DomainError } from '../../errors/domain.error'

export class GetUserByIdUseCase {
  constructor(private readonly repo: IUserRepository) {}

  async execute(id: string): Promise<UserPublic> {
    const user = await this.repo.findByIdPublic(id)
    if (!user) throw new DomainError('User not found', 'NOT_FOUND', 404)
    return user
  }
}
