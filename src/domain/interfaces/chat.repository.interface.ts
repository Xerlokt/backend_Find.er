import { Chat, ChatInitiator } from '../entities/chat.entity'
import { Message } from '../entities/message.entity'

export interface ChatParticipants {
  candidateUserId: string
  recruiterUserId: string
}

export interface ChatListItem {
  id: string
  jobId: string
  initiatedBy: ChatInitiator
  isActive: boolean
  createdAt: Date
  candidateName: string
  candidateUserId: string
  companyName: string
  recruiterUserId: string
}

export interface IChatRepository {
  createOrGetChat(
    candidateId: string,
    companyId: string,
    jobId: string,
    initiator: ChatInitiator,
  ): Promise<Chat>
  createMessage(chatId: string, senderId: string, content: string): Promise<Message>
  findMessages(
    chatId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<Message[]>
  findById(chatId: string): Promise<Chat | null>
  findParticipants(chatId: string): Promise<ChatParticipants | null>
  countRecruiterMessages(chatId: string, recruiterUserId: string): Promise<number>
  findByUserId(userId: string): Promise<ChatListItem[]>
  markMessagesRead(chatId: string, excludeSenderId: string): Promise<void>
}
