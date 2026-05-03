// src/shared/interfaces/chat.interface.ts
// ARCH-04: Boundary between chat module and swipe/credits modules.
// SwipeService and CreditService depend on IChatService — NOT on ChatService directly.
// Never import ChatService or ChatRepository from outside src/modules/chat/.

import { ChatInitiator } from '@prisma/client'

export interface IChatService {
  createOrGetChat(
    candidateId: string,
    companyId: string,
    jobId: string,
    initiator: ChatInitiator,
  ): Promise<{ chatId: string }>

  sendMessage(
    chatId: string,
    senderId: string,
    content: string,
  ): Promise<{
    id: string
    chatId: string
    senderId: string
    content: string
    createdAt: Date
    readAt: Date | null
  }>
}
