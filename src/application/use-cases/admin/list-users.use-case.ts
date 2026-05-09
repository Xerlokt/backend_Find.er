import { IUserRepository, UserPublic } from '../../../domain/interfaces/user.repository.interface'

export class ListUsersUseCase {
  constructor(private readonly repo: IUserRepository) {}

  async execute(page: number, limit: number): Promise<UserPublic[]> {
    return this.repo.findMany({ skip: (page - 1) * limit, take: limit })
  }
}
