import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { WebSocket } from '@fastify/websocket'
import { authenticate } from '../plugins/authenticate.hook'
import { requireRole } from '../../../shared/hooks/requireRole'
import { AppError } from '../../../shared/errors/AppError'
import { DomainError } from '../../../application/errors/domain.error'
import type { IChatService } from '../../../shared/interfaces/chat.interface'
import type { IChatRepository } from '../../../domain/interfaces/chat.repository.interface'
import { ChatController } from '../../../adapters/controllers/chat.controller'

// In-memory connection store — module-level singleton (D-10)
// Map<chatId, Set<WebSocket>>
const connections = new Map<string, Set<WebSocket>>()

function addConnection(chatId: string, socket: WebSocket): void {
  if (!connections.has(chatId)) {
    connections.set(chatId, new Set())
  }
  connections.get(chatId)!.add(socket)
}

function removeConnection(chatId: string, socket: WebSocket): void {
  const room = connections.get(chatId)
  if (room) {
    room.delete(socket)
    if (room.size === 0) connections.delete(chatId) // Prevent memory leak (RESEARCH Pitfall 4)
  }
}

function broadcast(chatId: string, message: object): void {
  const room = connections.get(chatId)
  if (!room) return
  const json = JSON.stringify(message)
  for (const socket of room) {
    if (socket.readyState === socket.OPEN) {
      socket.send(json)
    }
  }
}

// Zod schemas
const ChatIdParamsSchema = z.object({ chatId: z.string().uuid() })
const IncomingMessageSchema = z.object({
  content: z.string().min(1).max(5000),
})

// Extended service interface — beyond IChatService (only needed in routes layer)
export interface IChatRouteService extends IChatService {
  verifyParticipant(chatId: string, userId: string): Promise<boolean>
  getMessages(
    chatId: string,
    userId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<{ data: object[]; nextCursor: string | null }>
  listChats(userId: string): Promise<object[]>
}

export async function chatRoutes(
  app: FastifyInstance,
  opts: { service: IChatRouteService; repo: IChatRepository },
): Promise<void> {
  const service = opts.service
  const ctrl = new ChatController(opts.repo)

  // GET /chats — list chats for authenticated user (D-12)
  app.get('/', {
    preHandler: [authenticate, requireRole('CANDIDATE', 'RECRUITER')],
  }, ctrl.listChats.bind(ctrl))

  // GET /chats/:chatId/messages — paginated message history (D-13, D-14)
  app.get('/:chatId/messages', {
    preHandler: [authenticate, requireRole('CANDIDATE', 'RECRUITER')],
  }, ctrl.getMessages.bind(ctrl))

  // GET /chats/:chatId/ws — WebSocket upgrade (D-08, D-09, D-10, D-11)
  app.get('/:chatId/ws', {
    websocket: true,
    preHandler: [authenticate], // JWT verify BEFORE upgrade; participant check is in handler body (D-09)
  }, async (socket: WebSocket, request) => {
    const { chatId } = ChatIdParamsSchema.parse(request.params)

    // Buffer pending messages FIRST (synchronous) — prevents dropping messages
    // that arrive while async participant check is running (RESEARCH Pitfall 2)
    const pending: Buffer[] = []
    socket.on('message', (data) => pending.push(data as Buffer))

    // Async participant check (D-09)
    const isParticipant = await service.verifyParticipant(chatId, request.user.id)
    if (!isParticipant) {
      socket.close(1008, 'Forbidden')
      return
    }

    addConnection(chatId, socket)

    // Real message handler: validate → persist → broadcast (D-11)
    const handleMessage = async (rawData: Buffer): Promise<void> => {
      let payload: { content: string }
      try {
        payload = IncomingMessageSchema.parse(JSON.parse(rawData.toString()))
      } catch {
        socket.send(JSON.stringify({ error: 'INVALID_PAYLOAD' }))
        return
      }
      try {
        const message = await service.sendMessage(chatId, request.user.id, payload.content)
        broadcast(chatId, message) // Broadcast AFTER persist (D-11)
      } catch (err: unknown) {
        const code = err instanceof DomainError ? err.code
                   : err instanceof AppError ? err.code
                   : 'SEND_ERROR'
        socket.send(JSON.stringify({ error: code }))
      }
    }

    // Swap buffer listener to real handler, drain buffered messages
    socket.removeAllListeners('message')
    socket.on('message', handleMessage)
    for (const data of pending) await handleMessage(data)

    socket.on('close', () => removeConnection(chatId, socket))
    socket.on('error', () => removeConnection(chatId, socket))
  })
}
