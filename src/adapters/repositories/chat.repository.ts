import { prisma } from '../../infrastructure/database/prisma'
import { IChatRepository, ChatParticipants, ChatListItem } from '../../domain/interfaces/chat.repository.interface'
import { Chat, ChatInitiator } from '../../domain/entities/chat.entity'
import { Message } from '../../domain/entities/message.entity'

export class ChatRepository implements IChatRepository {
  private toDomain(row: any): Chat {
    return {
      id: row.id,
      candidateId: row.candidateId,
      jobId: row.jobId,
      companyId: row.companyId,
      initiatedBy: row.initiatedBy as ChatInitiator,
      expiresAt: row.expiresAt,
      isActive: row.isActive,
      createdAt: row.createdAt,
    }
  }

  private toMessageDomain(row: any): Message {
    return {
      id: row.id,
      chatId: row.chatId,
      senderId: row.senderId,
      content: row.content,
      createdAt: row.createdAt,
      readAt: row.readAt,
    }
  }

  async createOrGetChat(
    candidateId: string,
    companyId: string,
    jobId: string,
    initiator: ChatInitiator,
  ): Promise<Chat> {
    const row = await prisma.chat.upsert({
      where: { candidateId_companyId_jobId: { candidateId, companyId, jobId } },
      create: { candidateId, companyId, jobId, initiatedBy: initiator, isActive: true },
      update: {},
    })
    return this.toDomain(row)
  }

  async createMessage(chatId: string, senderId: string, content: string): Promise<Message> {
    const row = await prisma.message.create({
      data: { chatId, senderId, content },
    })
    return this.toMessageDomain(row)
  }

  async findMessages(chatId: string, cursor: string | undefined, limit: number): Promise<Message[]> {
    const rows = await prisma.message.findMany({
      where: { chatId },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    })
    return rows.map((row) => this.toMessageDomain(row))
  }

  async findById(chatId: string): Promise<Chat | null> {
    const row = await prisma.chat.findUnique({ where: { id: chatId } })
    return row ? this.toDomain(row) : null
  }

  async findParticipants(chatId: string): Promise<ChatParticipants | null> {
    const row = await prisma.chat.findUnique({
      where: { id: chatId },
      include: {
        candidate: { select: { userId: true } },
        job: {
          include: {
            recruiter: { select: { userId: true } },
            company: { select: { name: true } },
          },
        },
      },
    })
    if (!row) return null
    return {
      candidateUserId: row.candidate.userId,
      recruiterUserId: row.job.recruiter.userId,
      companyName: row.job.company.name,
    }
  }

  async countRecruiterMessages(chatId: string, recruiterUserId: string): Promise<number> {
    return prisma.message.count({
      where: { chatId, senderId: recruiterUserId },
    })
  }

  async findByUserId(userId: string): Promise<ChatListItem[]> {
    const chats = await prisma.chat.findMany({
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
    return chats.map((chat) => ({
      id: chat.id,
      jobId: chat.jobId,
      initiatedBy: chat.initiatedBy as ChatInitiator,
      isActive: chat.isActive,
      createdAt: chat.createdAt,
      candidateName: chat.candidate.name,
      candidateUserId: chat.candidate.userId,
      companyName: chat.job.company.name,
      recruiterUserId: chat.job.recruiter.userId,
    }))
  }

  async markMessagesRead(chatId: string, excludeSenderId: string): Promise<void> {
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
