import { AppError } from '../../src/infrastructure/http/errors/app.error'
import { errorHandler } from '../../src/infrastructure/http/plugins/error-handler'
import { ZodError, z } from 'zod'
import { FastifyRequest, FastifyReply } from 'fastify'

function mockReply() {
  const reply = { statusCode: 0, body: null as unknown } as {
    statusCode: number
    body: unknown
    status: (code: number) => typeof reply
    send: (body: unknown) => typeof reply
  }
  reply.status = (code: number) => { reply.statusCode = code; return reply }
  reply.send = (body: unknown) => { reply.body = body; return reply }
  return reply
}

const fakeRequest = {} as FastifyRequest

describe('errorHandler', () => {
  it('handles AppError with correct status and message', () => {
    const err = new AppError('Not found', 404)
    const reply = mockReply()
    errorHandler(err, fakeRequest, reply as unknown as FastifyReply)
    expect(reply.statusCode).toBe(404)
    expect((reply.body as { error: string }).error).toBe('Not found')
  })

  it('handles ZodError with 400 and details', () => {
    const schema = z.object({ email: z.string().email() })
    let zodErr: ZodError
    try { schema.parse({ email: 'bad' }) } catch (e) { zodErr = e as ZodError }
    const reply = mockReply()
    errorHandler(zodErr!, fakeRequest, reply as unknown as FastifyReply)
    expect(reply.statusCode).toBe(400)
    expect((reply.body as { error: string }).error).toBe('Validation error')
  })

  it('handles unknown errors with 500 and no stack trace', () => {
    const err = new Error('DB exploded')
    const reply = mockReply()
    errorHandler(err, fakeRequest, reply as unknown as FastifyReply)
    expect(reply.statusCode).toBe(500)
    expect((reply.body as { error: string }).error).toBe('Internal server error')
    expect(reply.body).not.toHaveProperty('stack')
  })
})
