import Fastify, { FastifyInstance } from 'fastify'
import fastifyWebsocket from '@fastify/websocket'
import helmetPlugin from './infrastructure/http/plugins/helmet.plugin'
import corsPlugin from './infrastructure/http/plugins/cors.plugin'
import jwtPlugin from './infrastructure/http/plugins/jwt.plugin'
import rateLimitPlugin from './infrastructure/http/plugins/rate-limit.plugin'
import { schedulerPlugin } from './infrastructure/http/plugins/scheduler.plugin'
import { errorHandler } from './infrastructure/http/plugins/error-handler'
import { healthRoutes } from './infrastructure/http/routes/health.routes'
import { IMailerPort } from './application/ports/mailer.port'
import { ICnpjLookupPort } from './application/ports/cnpj-lookup.port'
import { authRoutes } from './infrastructure/http/routes/auth.routes'
import { candidateRoutes } from './infrastructure/http/routes/candidate.routes'
import { companyRoutes } from './infrastructure/http/routes/company.routes'
import { recruiterRoutes } from './infrastructure/http/routes/recruiter.routes'
import { adminRoutes } from './infrastructure/http/routes/admin.routes'
import { CreditRepository } from './adapters/repositories/credit.repository'
import { CreditService } from './adapters/services/credit.service'
import { jobRoutes } from './infrastructure/http/routes/job.routes'
import { swipeRoutes, swipeJobRoutes } from './infrastructure/http/routes/swipe.routes'
import { creditsJobRoutes } from './infrastructure/http/routes/credits.routes'
import { ChatRepository } from './adapters/repositories/chat.repository'
import { ChatService } from './adapters/services/chat.service'
import { chatRoutes } from './infrastructure/http/routes/chat.routes'
import { PushTokenRepository } from './adapters/repositories/push-token.repository'
import { ExpoPushAdapter } from './adapters/services/expo-push.adapter'
import { NotifyNewMessageUseCase } from './application/use-cases/push/notify-new-message.use-case'
import { pushRoutes } from './infrastructure/http/routes/push.routes'
import { discRoutes } from './infrastructure/http/routes/disc.routes'
import { Neo4jAdapter } from './adapters/services/neo4j.adapter'
import { getNeo4jDriver } from './infrastructure/database/neo4j'
import { RedisAdapter } from './adapters/services/redis.adapter'
import { getRedisClient, closeRedis } from './infrastructure/database/redis'
import { WeightsRepository } from './adapters/repositories/weights.repository'

// em teste nunca fala com SMTP de verdade, mesmo que o .env tenha credenciais
const silentMailer: IMailerPort = { sendVerificationCode: async () => undefined }

export interface BuildAppOptions {
  testing?: boolean
  /** injeção da consulta de CNPJ (testes); padrão: BrasilAPI */
  cnpjLookup?: ICnpjLookupPort
  /** injeção do envio de email (testes); padrão: SMTP via nodemailer */
  mailer?: IMailerPort
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
  const pushTokenRepo = new PushTokenRepository()
  // em teste não bate no Expo de verdade
  const notifier = opts.testing ? undefined : new NotifyNewMessageUseCase(pushTokenRepo, new ExpoPushAdapter())
  const chatService = new ChatService(chatRepo, notifier)

  // Composition root: Neo4jAdapter — injected into swipe routes for fit score computation
  const neo4jAdapter = new Neo4jAdapter(getNeo4jDriver())

  // Composition root: RedisAdapter — injected into swipe routes (feed/ranking) and candidate routes (profile update invalidation)
  const redisAdapter = new RedisAdapter(getRedisClient())
  app.addHook('onClose', async () => { await closeRedis() })

  // Composition root: WeightsRepository — EMA weight learning (LEARN-01/02/03, Phase 18 Plan 04)
  const weightsRepository = new WeightsRepository()

  // Routes
  await app.register(healthRoutes)
  await app.register(authRoutes, { prefix: '/auth', cnpjLookup: opts.cnpjLookup, mailer: opts.mailer ?? (opts.testing ? silentMailer : undefined) })
  await app.register(candidateRoutes, { prefix: '/candidates', cache: redisAdapter })
  await app.register(discRoutes, { prefix: '/candidates' })
  await app.register(companyRoutes, { prefix: '/companies' })
  await app.register(recruiterRoutes, { prefix: '/recruiters' })
  await app.register(jobRoutes, { prefix: '/jobs' })

  // Swipe routes — IChatService, Neo4jAdapter, RedisAdapter, and WeightsRepository injected via opts (D-01, ARCH-04, SCALE-01, SCALE-02, LEARN-01)
  await app.register(swipeRoutes, { prefix: '/swipes', chat: chatService, neo4j: neo4jAdapter, cache: redisAdapter, weights: weightsRepository })
  await app.register(swipeJobRoutes, { prefix: '/jobs', chat: chatService, neo4j: neo4jAdapter, cache: redisAdapter, weights: weightsRepository })

  // Credits routes — IChatService injected via opts (D-01, ARCH-04)
  await app.register(creditsJobRoutes, { prefix: '/jobs', chat: chatService })

  // Composition root: admin — CreditService for grantCredits only (unlockCandidate removed, CR-01)
  const creditRepo = new CreditRepository()
  const creditService = new CreditService(creditRepo)
  await app.register(adminRoutes, { prefix: '/admin', creditService })

  // Chat routes under /chats prefix — chatService and chatRepo injected (WR-03: DI fix)
  await app.register(chatRoutes, { prefix: '/chats', service: chatService, repo: chatRepo })
  await app.register(pushRoutes, { prefix: '/push-tokens', repo: pushTokenRepo })

  if (!opts.testing) {
    await app.register(schedulerPlugin)
  }

  return app
}
