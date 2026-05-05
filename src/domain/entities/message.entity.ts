export interface Message {
  id: string
  chatId: string
  senderId: string
  content: string
  createdAt: Date
  readAt: Date | null
}
