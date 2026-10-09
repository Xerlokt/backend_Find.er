import { randomBytes } from 'crypto'
import { IUserRepository } from '../../../domain/interfaces/user.repository.interface'
import { IRefreshTokenRepository } from '../../../domain/interfaces/refresh-token.repository.interface'
import { ICompanyRepository } from '../../../domain/interfaces/company.repository.interface'
import { IHashPort } from '../../ports/hash.port'
import { ITokenPort } from '../../ports/token.port'
import { ICnpjLookupPort } from '../../ports/cnpj-lookup.port'
import { DomainError } from '../../errors/domain.error'
import { isValidCnpj, normalizeCnpj } from '../../../domain/cnpj'

export interface RegisterCompanyInput {
  email: string
  password: string
  cnpj: string
  description?: string
  logoUrl?: string
}

/** Cadastro da conta da EMPRESA (login único): valida o CNPJ na Receita e cria usuário + empresa + vínculo. */
export class RegisterCompanyUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly companyRepo: ICompanyRepository,
    private readonly refreshTokenRepo: IRefreshTokenRepository,
    private readonly hash: IHashPort,
    private readonly token: ITokenPort,
    private readonly cnpjLookup: ICnpjLookupPort,
  ) {}

  async execute(input: RegisterCompanyInput): Promise<{ accessToken: string; refreshToken: string }> {
    const cnpj = normalizeCnpj(input.cnpj)
    if (!isValidCnpj(cnpj)) throw new DomainError('CNPJ inválido', 'INVALID_CNPJ', 422)

    if (await this.userRepo.findByEmail(input.email)) {
      throw new DomainError('Email already in use', 'CONFLICT', 409)
    }
    if (await this.companyRepo.findByCnpj(cnpj)) {
      throw new DomainError('Já existe uma conta para este CNPJ', 'CNPJ_ALREADY_REGISTERED', 409)
    }

    const info = await this.cnpjLookup.lookup(cnpj)
    if (!info) throw new DomainError('CNPJ não encontrado na Receita Federal', 'CNPJ_NOT_FOUND', 422)
    if (info.status !== 'ATIVA') {
      throw new DomainError(`CNPJ com situação cadastral ${info.status || 'desconhecida'}`, 'CNPJ_NOT_ACTIVE', 422)
    }

    const passwordHash = await this.hash.hash(input.password)
    const { user } = await this.companyRepo.createWithRecruiter({
      email: input.email,
      passwordHash,
      company: {
        name: info.tradeName ?? info.legalName,
        cnpj,
        legalName: info.legalName,
        tradeName: info.tradeName,
        city: info.city,
        state: info.state,
        description: input.description,
        logoUrl: input.logoUrl,
      },
    })

    const accessToken = this.token.signAccess({ id: user.id, role: user.role })
    const { raw, hashed } = this.token.generateRefreshToken()
    const familyId = randomBytes(16).toString('hex')
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    await this.refreshTokenRepo.create({ tokenHash: hashed, familyId, userId: user.id, expiresAt })

    return { accessToken, refreshToken: raw }
  }
}
