import nodemailer, { Transporter } from 'nodemailer'
import type { IMailerPort } from '../../application/ports/mailer.port'

/**
 * Envia email por SMTP. Sem SMTP_HOST configurado (dev), só imprime o código no log do servidor.
 */
export class NodemailerAdapter implements IMailerPort {
  private transporter?: Transporter

  private getTransporter(): Transporter | null {
    const host = process.env.SMTP_HOST
    if (!host) return null
    const port = Number(process.env.SMTP_PORT ?? 587)
    this.transporter ??= nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    })
    return this.transporter
  }

  async sendVerificationCode(to: string, code: string, expiresInMinutes: number): Promise<void> {
    const transporter = this.getTransporter()
    if (!transporter) {
      console.log(`[mailer] SMTP não configurado — código de ${to}: ${code}`)
      return
    }
    await transporter.sendMail({
      from: process.env.MAIL_FROM ?? 'Find.er <no-reply@finder.app>',
      to,
      subject: `${code} é seu código de verificação do Find.er`,
      text: `Seu código de verificação do Find.er é ${code}.\nEle expira em ${expiresInMinutes} minutos.\nSe não foi você, ignore este email.`,
      html: `<div style="font-family:sans-serif"><p>Seu código de verificação do Find.er:</p><p style="font-size:32px;font-weight:bold;letter-spacing:6px">${code}</p><p>Ele expira em ${expiresInMinutes} minutos. Se não foi você, ignore este email.</p></div>`,
    })
  }
}
