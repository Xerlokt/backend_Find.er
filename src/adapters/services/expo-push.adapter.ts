import type { IPushPort, PushMessage } from '../../application/ports/push.port'

const EXPO_URL = 'https://exp.host/--/api/v2/push/send'

type FetchFn = typeof fetch

export class ExpoPushAdapter implements IPushPort {
  constructor(private readonly fetchFn: FetchFn = fetch) {}

  async send(messages: PushMessage[]): Promise<{ invalidTokens: string[] }> {
    if (messages.length === 0) return { invalidTokens: [] }

    const res = await this.fetchFn(EXPO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages.map((m) => ({ ...m, sound: 'default' }))),
    })
    if (!res.ok) throw new Error(`Expo push failed: ${res.status}`)

    const { data } = (await res.json()) as { data: { status: string; details?: { error?: string } }[] }
    // os tickets vêm na mesma ordem das mensagens enviadas
    const invalidTokens = messages
      .filter((_, i) => data[i]?.status === 'error' && data[i]?.details?.error === 'DeviceNotRegistered')
      .map((m) => m.to)
    return { invalidTokens }
  }
}
