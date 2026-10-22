export const UNLOCK_COST_BY_PLAN: Record<string, number> = {
  FREE: 2,
  PRO: 1,
}

export interface CreditPackage {
  id: string
  credits: number
  priceCents: number
}

// Placeholder catalog (prices are not final). Bigger packages are cheaper per credit.
export const CREDIT_PACKAGES: readonly CreditPackage[] = [
  { id: 'starter', credits: 10, priceCents: 2990 },
  { id: 'pro', credits: 50, priceCents: 11990 },
  { id: 'scale', credits: 150, priceCents: 29990 },
]

export const findCreditPackage = (id: string): CreditPackage | undefined =>
  CREDIT_PACKAGES.find((p) => p.id === id)
