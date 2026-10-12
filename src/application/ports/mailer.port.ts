export interface IMailerPort {
  sendVerificationCode(to: string, code: string, expiresInMinutes: number): Promise<void>
}
