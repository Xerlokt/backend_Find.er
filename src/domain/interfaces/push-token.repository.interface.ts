export interface IPushTokenRepository {
  /** Um token pertence a um aparelho: se outro usuário logar nele, o token passa a ser dele. */
  upsert(userId: string, token: string): Promise<void>
  remove(userId: string, token: string): Promise<void>
  findByUserId(userId: string): Promise<string[]>
  removeMany(tokens: string[]): Promise<void>
}
