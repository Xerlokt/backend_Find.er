import { AppError } from '../../src/infrastructure/http/errors/app.error'

describe('AppError', () => {
  it('sets message and statusCode', () => {
    const err = new AppError('Not found', 404)
    expect(err.message).toBe('Not found')
    expect(err.statusCode).toBe(404)
    expect(err.name).toBe('AppError')
  })

  it('defaults statusCode to 400', () => {
    const err = new AppError('Bad request')
    expect(err.statusCode).toBe(400)
  })

  it('accepts an optional error code', () => {
    const err = new AppError('Forbidden', 403, 'FORBIDDEN')
    expect(err.code).toBe('FORBIDDEN')
  })

  it('is an instance of Error', () => {
    expect(new AppError('test')).toBeInstanceOf(Error)
  })
})
