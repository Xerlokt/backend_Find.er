// Local port interface — avoids importing CreditService from src/modules/credits/ (Phase 12 migration)
interface ICreditGrantPort {
  grantCredits(companyId: string, amount: number, reason?: string): Promise<unknown>
}

export class AdjustAdminCreditsUseCase {
  constructor(private readonly creditService: ICreditGrantPort) {}

  async execute(companyId: string, amount: number): Promise<unknown> {
    return this.creditService.grantCredits(companyId, amount, 'admin_grant')
  }
}
