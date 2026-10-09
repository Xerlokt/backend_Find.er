/** Remove tudo que não é dígito. */
export function normalizeCnpj(raw: string): string {
  return raw.replace(/\D/g, '')
}

function checkDigit(base: string): number {
  // pesos 5..2,9..2 para o 1º dígito e 6..2,9..2 para o 2º (módulo 11)
  const weights = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  const sum = base.split('').reduce((acc, d, i) => acc + Number(d) * weights[i], 0)
  const rest = sum % 11
  return rest < 2 ? 0 : 11 - rest
}

/** Valida formato (14 dígitos, não repetidos) e os dois dígitos verificadores. */
export function isValidCnpj(raw: string): boolean {
  const cnpj = normalizeCnpj(raw)
  if (cnpj.length !== 14) return false
  if (/^(\d)\1{13}$/.test(cnpj)) return false
  const d1 = checkDigit(cnpj.slice(0, 12))
  const d2 = checkDigit(cnpj.slice(0, 12) + d1)
  return cnpj.endsWith(`${d1}${d2}`)
}
