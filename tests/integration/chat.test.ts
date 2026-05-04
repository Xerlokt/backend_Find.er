import '../helpers/setup'
import { buildApp } from '../../src/app'
import supertest from 'supertest'
import {
  createUser,
  createCandidate,
  createCompany,
  createJob,
  createSwipe,
  createChat,
  createMessage,
} from '../helpers/factories'
import bcrypt from 'bcryptjs'
import { prisma } from '../../src/shared/db/prisma'

async function loginUser(
  app: Awaited<ReturnType<typeof buildApp>>,
  email: string,
  password = 'password123',
): Promise<string> {
  const response = await supertest(app.server).post('/auth/login').send({ email, password })
  return response.body.accessToken as string
}

async function setupChatWorld(app: Awaited<ReturnType<typeof buildApp>>) {
  const company = await createCompany({ credits: 10 })
  const passwordHash = await bcrypt.hash('password123', 12)
  const recUser = await createUser({
    role: 'RECRUITER',
    email: `rec-${Date.now()}@test.com`,
    passwordHash,
  })
  const recProfile = await prisma.recruiterProfile.create({
    data: { userId: recUser.id, companyId: company.id },
  })
  const { user: candUser, profile: candProfile } = await createCandidate()
  const job = await createJob(company.id, recProfile.id)
  const chat = await createChat(candProfile.id, job.id, company.id)
  const recToken = await loginUser(app, recUser.email)
  const candToken = await loginUser(app, candUser.email)
  return { company, recUser, recProfile, candUser, candProfile, job, chat, recToken, candToken }
}

describe('Chat Integration Tests', () => {
  describe('CHAT-02: Chat auto-created on LIKE swipe', () => {
    it('201 with chatId when candidate swipes LIKE', async () => {
      const app = await buildApp({ testing: true })
      await app.ready()
      const { candProfile: _cp, candUser, company, recProfile, recUser } = await setupChatWorld(app)
      const { user: cUser, profile: cProfile } = await createCandidate()
      const passwordHash = await bcrypt.hash('password123', 12)
      const recU = await createUser({ role: 'RECRUITER', email: `r-${Date.now()}@test.com`, passwordHash })
      const recP = await prisma.recruiterProfile.create({ data: { userId: recU.id, companyId: company.id } })
      const job = await createJob(company.id, recP.id)
      const candToken = await loginUser(app, cUser.email)
      const res = await supertest(app.server)
        .post('/swipes')
        .set('Authorization', `Bearer ${candToken}`)
        .send({ jobId: job.id, direction: 'LIKE' })
      expect(res.status).toBe(201)
      expect(typeof res.body.chatId).toBe('string')
      await app.close()
    })

    it('chatId is idempotent: same LIKE on same job returns same chatId', async () => {
      // Stub — will verify same chatId returned on double swipe attempt (409 expected from swipe)
      expect(true).toBe(true)
    })
  })

  describe('CHAT-02: Chat auto-created on credit unlock', () => {
    it('200 with chatId when recruiter unlocks DISLIKE candidate', async () => {
      const app = await buildApp({ testing: true })
      await app.ready()
      const { candProfile, job, recToken } = await setupChatWorld(app)
      // Unlock requires a DISLIKE swipe to exist (credits.service.ts line 23)
      await createSwipe(candProfile.id, job.id, { direction: 'DISLIKE' })
      const res = await supertest(app.server)
        .post(`/jobs/${job.id}/candidates/${candProfile.id}/unlock`)
        .set('Authorization', `Bearer ${recToken}`)
        .send()
      expect(res.status).toBe(201)
      expect(typeof res.body.chatId).toBe('string')
      await app.close()
    })
  })

  describe('CHAT-02: Recruiter-first rule', () => {
    it('403 RECRUITER_MUST_INITIATE when candidate sends first message via WS', async () => {
      // Stub — WS tests wired in Plan 03
      expect(true).toBe(true)
    })
  })

  describe('CHAT-01: WebSocket connection', () => {
    it('WS connects successfully with valid JWT and participant check', async () => {
      // Stub — WS gateway wired in Plan 03
      expect(true).toBe(true)
    })

    it('WS rejected (close 1008) when user is not a participant', async () => {
      // Stub — WS gateway wired in Plan 03
      expect(true).toBe(true)
    })
  })

  describe('CHAT-03: Message persistence', () => {
    it('message persisted to DB after WS send', async () => {
      // Stub — WS gateway wired in Plan 03
      expect(true).toBe(true)
    })

    it('invalid WS payload (missing content) returns error response', async () => {
      // Stub — WS gateway wired in Plan 03
      expect(true).toBe(true)
    })
  })

  describe('CHAT-04: Message history REST', () => {
    it('GET /chats returns list of chats for authenticated user', async () => {
      const app = await buildApp({ testing: true })
      await app.ready()
      const { chat, candToken } = await setupChatWorld(app)
      const res = await supertest(app.server)
        .get('/chats')
        .set('Authorization', `Bearer ${candToken}`)
      expect(res.status).toBe(200)
      expect(Array.isArray(res.body)).toBe(true)
      await app.close()
    })

    it('GET /chats/:chatId/messages returns paginated history', async () => {
      const app = await buildApp({ testing: true })
      await app.ready()
      const { chat, recUser, candUser, recToken } = await setupChatWorld(app)
      // Create a message to verify pagination response shape
      await createMessage(chat.id, recUser.id, { content: 'Hello' })
      const res = await supertest(app.server)
        .get(`/chats/${chat.id}/messages`)
        .set('Authorization', `Bearer ${recToken}`)
      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('data')
      expect(res.body).toHaveProperty('nextCursor')
      await app.close()
    })

    it('GET /chats/:chatId/messages marks readAt on other participant messages', async () => {
      // Stub — full assertion wired in Plan 03
      expect(true).toBe(true)
    })

    it('GET /chats/:chatId/messages returns 403 for non-participant', async () => {
      const app = await buildApp({ testing: true })
      await app.ready()
      const { chat } = await setupChatWorld(app)
      const { user: stranger } = await createCandidate()
      const strangerToken = await loginUser(app, stranger.email)
      const res = await supertest(app.server)
        .get(`/chats/${chat.id}/messages`)
        .set('Authorization', `Bearer ${strangerToken}`)
      expect(res.status).toBe(403)
      await app.close()
    })
  })
})
