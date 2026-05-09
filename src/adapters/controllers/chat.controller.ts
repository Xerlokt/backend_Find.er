import { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { ChatRepository } from '../repositories/chat.repository'
import { GetMessagesUseCase } from '../../application/use-cases/chat/get-messages.use-case'
import { ListChatsUseCase } from '../../application/use-cases/chat/list-chats.use-case'
import { DomainError } from '../../application/errors/domain.error'

const ChatIdParamsSchema = z.object({
  chatId: z.string().uuid(),
})

const MessagesQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
})

export class ChatController {
  async listChats(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const useCase = new ListChatsUseCase(new ChatRepository())
    try {
      const chats = await useCase.execute(request.user.id)
      reply.status(200).send(chats)
    } catch (err) {
      if (err instanceof DomainError) {
        reply.status(err.statusCode).send({ error: err.message, code: err.code })
        return
      }
      throw err
    }
  }

  async getMessages(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { chatId } = ChatIdParamsSchema.parse(request.params)
    const { cursor, limit } = MessagesQuerySchema.parse(request.query)
    const useCase = new GetMessagesUseCase(new ChatRepository())
    try {
      const result = await useCase.execute(chatId, request.user.id, cursor, limit)
      reply.status(200).send(result)
    } catch (err) {
      if (err instanceof DomainError) {
        reply.status(err.statusCode).send({ error: err.message, code: err.code })
        return
      }
      throw err
    }
  }
}
