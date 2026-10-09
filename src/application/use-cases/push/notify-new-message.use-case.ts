import type { IPushTokenRepository } from '../../../domain/interfaces/push-token.repository.interface'
import type { IPushPort } from '../../ports/push.port'

const BODY_MAX = 140

export interface NewMessageNotification {
  recipientUserId: string
  chatId: string
  title: string
  content: string
}

export interface INotifyNewMessage {
  execute(input: NewMessageNotification): Promise<void>
}

const preview = (text: string) => (text.length <= BODY_MAX ? text : `${text.slice(0, BODY_MAX - 1)}…`)

export class NotifyNewMessageUseCase implements INotifyNewMessage {
  constructor(
    private readonly tokens: IPushTokenRepository,
    private readonly push: IPushPort,
  ) {}

  /** Nunca lança: a mensagem já foi gravada, o push é só um aviso. */
  async execute({ recipientUserId, chatId, title, content }: NewMessageNotification): Promise<void> {
    try {
      const tokens = await this.tokens.findByUserId(recipientUserId)
      if (tokens.length === 0) return
      const { invalidTokens } = await this.push.send(
        tokens.map((to) => ({ to, title, body: preview(content), data: { chatId } })),
      )
      if (invalidTokens.length > 0) await this.tokens.removeMany(invalidTokens)
    } catch {
      // aviso best-effort
    }
  }
}
