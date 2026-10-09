export interface CnpjInfo {
  cnpj: string
  legalName: string
  tradeName: string | null
  /** situação cadastral na Receita, ex.: "ATIVA", "BAIXADA", "SUSPENSA" */
  status: string
  city: string | null
  state: string | null
}

export interface ICnpjLookupPort {
  /** null quando o CNPJ não existe na base da Receita; lança DomainError 503 se a consulta estiver indisponível. */
  lookup(cnpj: string): Promise<CnpjInfo | null>
}
