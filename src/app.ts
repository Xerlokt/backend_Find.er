import Fastify, { FastifyInstance } from 'fastify'
import fastifyWebsocket from '@fastify/websocket'
import helmetPlugin from './shared/plugins/helmet'
import corsPlugin from './shared/plugins/cors'
import jwtPlugin from './shared/plugins/jwt'
import rateLimitPlugin from './shared/plugins/rate-limit'
import { schedulerPlugin } from './shared/plugins/scheduler'
import { errorHandler } from './shared/errors/errorHandler'
import { healthRoutes } from './modules/health/health.routes'
import { authRoutes } from './infrastructure/http/routes/auth.routes'
import { candidateRoutes } from './modules/candidate/candidate.routes'
import { companyRoutes } from './modules/company/company.routes'
import { recruiterRoutes } from './modules/recruiter/recruiter.routes'
import { adminRoutes } from './modules/admin/admin.routes'
import { AdminService } from './modules/admin/admin.service'
import { CreditRepository } from './modules/credits/credits.repository'
import { CreditService } from './modules/credits/credits.service'
import { jobRoutes } from './modules/job/job.routes'
import { swipeRoutes, swipeJobRoutes } from './modules/swipe/swipe.routes'
import { creditsJobRoutes } from './modules/credits/credits.routes'
import { ChatRepository } from './modules/chat/chat.repository'
import { ChatService } from './modules/chat/chat.service'
import { chatRoutes } from './modules/chat/chat.routes'

export interface BuildAppOptions {
  testing?: boolean
}

export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: !opts.testing,
  })

  // Security plugins registered first (SEC-07)
  await app.register(helmetPlugin)
  await app.register(corsPlugin)
  await app.register(jwtPlugin)
  await app.register(rateLimitPlugin) // rate-limit BEFORE routes (SEC-05)

  // WebSocket plugin — MUST be registered before any route using { websocket: true }
  // Registering after chatRoutes would cause Fastify to throw at route definition time (RESEARCH Pitfall 1)
  await app.register(fastifyWebsocket)

  // Global error handler
  app.setErrorHandler(errorHandler)

  // Composition root: chat module (created before swipe/credits that depend on IChatService)
  const chatRepo = new ChatRepository()
  const chatService = new ChatService(chatRepo)

  // Routes
  await app.register(healthRoutes)
  await app.register(authRoutes, { prefix: '/auth' })
  await app.register(candidateRoutes, { prefix: '/candidates' })
  await app.register(companyRoutes, { prefix: '/companies' })
  await app.register(recruiterRoutes, { prefix: '/recruiters' })
  await app.register(jobRoutes, { prefix: '/jobs' })

  // Swipe routes — IChatService injected via opts (D-01, ARCH-04)
  await app.register(swipeRoutes, { prefix: '/swipes', chat: chatService })
  await app.register(swipeJobRoutes, { prefix: '/jobs', chat: chatService })

  // Credits routes — IChatService injected via opts (D-01, ARCH-04)
  await app.register(creditsJobRoutes, { prefix: '/jobs', chat: chatService })

  // Composition root: admin — CreditService receives chatService (D-01)
  const creditRepo = new CreditRepository()
  const creditService = new CreditService(creditRepo, chatService) // chatService injected (NEW)
  const adminService = new AdminService(creditService)
  await app.register(adminRoutes, { prefix: '/admin', service: adminService })

  // Chat routes under /chats prefix — chatService injected as IChatRouteService
  await app.register(chatRoutes, { prefix: '/chats', service: chatService })

  if (!opts.testing) {
    await app.register(schedulerPlugin)
  }

  return app
}
