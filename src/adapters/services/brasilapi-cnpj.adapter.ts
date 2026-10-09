import { CnpjInfo, ICnpjLookupPort } from '../../application/ports/cnpj-lookup.port'
import { DomainError } from '../../application/errors/domain.error'

const BASE_URL = process.env.BRASILAPI_URL ?? 'https://brasilapi.com.br/api/cnpj/v1'
const TIMEOUT_MS = 8000

export class BrasilApiCnpjAdapter implements ICnpjLookupPort {
  async lookup(cnpj: string): Promise<CnpjInfo | null> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
      const res = await fetch(`${BASE_URL}/${cnpj}`, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Find.er-Backend/1.0', Accept: 'application/json' },
      })
      if (res.status === 404 || res.status === 400) return null
      if (!res.ok) throw new Error(`BrasilAPI ${res.status}`)
      const b = (await res.json()) as Record<string, unknown>
      return {
        cnpj,
        legalName: String(b.razao_social ?? ''),
        tradeName: b.nome_fantasia ? String(b.nome_fantasia) : null,
        status: String(b.descricao_situacao_cadastral ?? '').toUpperCase(),
        city: b.municipio ? String(b.municipio) : null,
        state: b.uf ? String(b.uf) : null,
      }
    } catch {
      throw new DomainError('Consulta de CNPJ indisponível, tente novamente', 'CNPJ_LOOKUP_UNAVAILABLE', 503)
    } finally {
      clearTimeout(timer)
    }
  }
}
