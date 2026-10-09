export interface PushMessage {
  to: string
  title: string
  body: string
  data: Record<string, unknown>
}

export interface IPushPort {
  /** Devolve os tokens que o provedor disse não existirem mais (app desinstalado etc.). */
  send(messages: PushMessage[]): Promise<{ invalidTokens: string[] }>
}
