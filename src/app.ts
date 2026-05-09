import Fastify, { FastifyInstance } from 'fastify'
import fastifyWebsocket from '@fastify/websocket'
import helmetPlugin from './infrastructure/http/plugins/helmet.plugin'
import corsPlugin from './infrastructure/http/plugins/cors.plugin'
import jwtPlugin from './infrastructure/http/plugins/jwt.plugin'
import rateLimitPlugin from './infrastructure/http/plugins/rate-limit.plugin'
import { schedulerPlugin } from './infrastructure/http/plugins/scheduler.plugin'
import { errorHandler } from './shared/errors/errorHandler'
import { healthRoutes } from './modules/health/health.routes'
import { authRoutes } from './infrastructure/http/routes/auth.routes'
import { candidateRoutes } from './infrastructure/http/routes/candidate.routes'
import { companyRoutes } from './infrastructure/http/routes/company.routes'
import { recruiterRoutes } from './infrastructure/http/routes/recruiter.routes'
import { adminRoutes } from './infrastructure/http/routes/admin.routes'
import { CreditRepository } from './adapters/repositories/credit.repository'
import { CreditService } from './modules/credits/credits.service'
import { jobRoutes } from './infrastructure/http/routes/job.routes'
import { swipeRoutes, swipeJobRoutes } from './infrastructure/http/routes/swipe.routes'
import { creditsJobRoutes } from './infrastructure/http/routes/credits.routes'
import { ChatRepository } from './adapters/repositories/chat.repository'
import { ChatService } from './modules/chat/chat.service'
import { chatRoutes } from './infrastructure/http/routes/chat.routes'
import { Neo4jAdapter } from './adapters/services/neo4j.adapter'
import { getNeo4jDriver } from './shared/db/neo4j'

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

  // Composition root: Neo4jAdapter — injected into swipe routes for fit score computation
  const neo4jAdapter = new Neo4jAdapter(getNeo4jDriver())

  // Routes
  await app.register(healthRoutes)
  await app.register(authRoutes, { prefix: '/auth' })
  await app.register(candidateRoutes, { prefix: '/candidates' })
  await app.register(companyRoutes, { prefix: '/companies' })
  await app.register(recruiterRoutes, { prefix: '/recruiters' })
  await app.register(jobRoutes, { prefix: '/jobs' })

  // Swipe routes — IChatService and Neo4jAdapter injected via opts (D-01, ARCH-04)
  await app.register(swipeRoutes, { prefix: '/swipes', chat: chatService, neo4j: neo4jAdapter })
  await app.register(swipeJobRoutes, { prefix: '/jobs', chat: chatService, neo4j: neo4jAdapter })

  // Credits routes — IChatService injected via opts (D-01, ARCH-04)
  await app.register(creditsJobRoutes, { prefix: '/jobs', chat: chatService })

  // Composition root: admin — CreditService receives chatService (D-01)
  const creditRepo = new CreditRepository()
  const creditService = new CreditService(creditRepo, chatService) // chatService injected (NEW)
  await app.register(adminRoutes, { prefix: '/admin', creditService })

  // Chat routes under /chats prefix — chatService injected as IChatRouteService
  await app.register(chatRoutes, { prefix: '/chats', service: chatService })

  if (!opts.testing) {
    await app.register(schedulerPlugin)
  }

  return app
}
