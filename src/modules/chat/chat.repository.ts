import { prisma } from '../../shared/db/prisma'
import { ChatInitiator } from '@prisma/client'

export class ChatRepository {
  async createOrGetChat(
    candidateId: string,
    companyId: string,
    jobId: string,
    initiator: ChatInitiator,
  ) {
    return prisma.chat.upsert({
      where: { candidateId_companyId_jobId: { candidateId, companyId, jobId } },
      create: { candidateId, companyId, jobId, initiatedBy: initiator, isActive: true },
      update: {}, // No-op if exists — initiatedBy stays as first trigger (D-06)
    })
  }

  async createMessage(chatId: string, senderId: string, content: string) {
    return prisma.message.create({
      data: { chatId, senderId, content },
    })
  }

  async findMessages(chatId: string, cursor: string | undefined, limit: number) {
    return prisma.message.findMany({
      where: { chatId },
      orderBy: { createdAt: 'desc' }, // Newest first (D-13); client reverses to display
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    })
  }

  async findChatById(chatId: string) {
    return prisma.chat.findUnique({ where: { id: chatId } })
  }

  async findChatWithParticipants(chatId: string) {
    return prisma.chat.findUnique({
      where: { id: chatId },
      include: {
        candidate: { select: { userId: true } },
        job: {
          include: {
            recruiter: { select: { userId: true } },
          },
        },
      },
    })
  }

  async countRecruiterMessages(chatId: string, recruiterUserId: string): Promise<number> {
    return prisma.message.count({
      where: { chatId, senderId: recruiterUserId },
    })
  }

  async findChatsByUserId(userId: string) {
    return prisma.chat.findMany({
      where: {
        OR: [
          { candidate: { userId } },
          { job: { recruiter: { userId } } },
        ],
      },
      include: {
        candidate: { select: { userId: true, name: true } },
        job: {
          include: {
            recruiter: { select: { userId: true } },
            company: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  async markMessagesRead(chatId: string, excludeSenderId: string) {
    await prisma.message.updateMany({
      where: {
        chatId,
        senderId: { not: excludeSenderId },
        readAt: null,
      },
      data: { readAt: new Date() },
    })
  }
}
