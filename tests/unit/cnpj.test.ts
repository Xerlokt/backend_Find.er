import { isValidCnpj, normalizeCnpj } from '../../src/domain/cnpj'

describe('cnpj', () => {
  it('normaliza removendo máscara', () => {
    expect(normalizeCnpj('11.222.333/0001-81')).toBe('11222333000181')
  })

  it('aceita CNPJs com dígitos verificadores corretos', () => {
    expect(isValidCnpj('11.222.333/0001-81')).toBe(true)
    expect(isValidCnpj('11222333000181')).toBe(true)
    expect(isValidCnpj('00.000.000/0001-91')).toBe(true) // Banco do Brasil
  })

  it('rejeita dígito verificador errado', () => {
    expect(isValidCnpj('11.222.333/0001-82')).toBe(false)
  })

  it('rejeita tamanho incorreto e sequências repetidas', () => {
    expect(isValidCnpj('123')).toBe(false)
    expect(isValidCnpj('11111111111111')).toBe(false)
    expect(isValidCnpj('')).toBe(false)
  })
})
