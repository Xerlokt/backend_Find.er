import { RegisterPushTokenUseCase } from '../../src/application/use-cases/push/register-push-token.use-case'
import { UnregisterPushTokenUseCase } from '../../src/application/use-cases/push/unregister-push-token.use-case'
import { NotifyNewMessageUseCase } from '../../src/application/use-cases/push/notify-new-message.use-case'
import type { IPushTokenRepository } from '../../src/domain/interfaces/push-token.repository.interface'
import type { IPushPort } from '../../src/application/ports/push.port'

const makeRepo = (): jest.Mocked<IPushTokenRepository> => ({
  upsert: jest.fn(),
  remove: jest.fn(),
  findByUserId: jest.fn(),
  removeMany: jest.fn(),
})
const makePush = (): jest.Mocked<IPushPort> => ({ send: jest.fn() })

const TOKEN = 'ExponentPushToken[abc123]'

describe('RegisterPushTokenUseCase', () => {
  it('guarda o token do usuário', async () => {
    const repo = makeRepo()
    await new RegisterPushTokenUseCase(repo).execute('u1', TOKEN)
    expect(repo.upsert).toHaveBeenCalledWith('u1', TOKEN)
  })

  it('rejeita token que não é do Expo (400)', async () => {
    const repo = makeRepo()
    await expect(new RegisterPushTokenUseCase(repo).execute('u1', 'lixo')).rejects.toMatchObject({
      code: 'INVALID_PUSH_TOKEN',
      statusCode: 400,
    })
    expect(repo.upsert).not.toHaveBeenCalled()
  })

  it('aceita o formato ExpoPushToken[...] também', async () => {
    const repo = makeRepo()
    await new RegisterPushTokenUseCase(repo).execute('u1', 'ExpoPushToken[xyz]')
    expect(repo.upsert).toHaveBeenCalledWith('u1', 'ExpoPushToken[xyz]')
  })
})

describe('UnregisterPushTokenUseCase', () => {
  it('remove só o token daquele usuário', async () => {
    const repo = makeRepo()
    await new UnregisterPushTokenUseCase(repo).execute('u1', TOKEN)
    expect(repo.remove).toHaveBeenCalledWith('u1', TOKEN)
  })
})

describe('NotifyNewMessageUseCase', () => {
  const input = { recipientUserId: 'cand', chatId: 'chat-1', title: 'Nubloom', content: 'oi, tudo bem?' }

  it('envia um push por token do destinatário, com o chatId nos dados', async () => {
    const repo = makeRepo()
    const push = makePush()
    repo.findByUserId.mockResolvedValue(['t1', 't2'])
    push.send.mockResolvedValue({ invalidTokens: [] })

    await new NotifyNewMessageUseCase(repo, push).execute(input)

    expect(repo.findByUserId).toHaveBeenCalledWith('cand')
    expect(push.send).toHaveBeenCalledWith([
      { to: 't1', title: 'Nubloom', body: 'oi, tudo bem?', data: { chatId: 'chat-1' } },
      { to: 't2', title: 'Nubloom', body: 'oi, tudo bem?', data: { chatId: 'chat-1' } },
    ])
  })

  it('sem tokens não chama o serviço de push', async () => {
    const repo = makeRepo()
    const push = makePush()
    repo.findByUserId.mockResolvedValue([])
    await new NotifyNewMessageUseCase(repo, push).execute(input)
    expect(push.send).not.toHaveBeenCalled()
  })

  it('corta mensagens longas no corpo da notificação', async () => {
    const repo = makeRepo()
    const push = makePush()
    repo.findByUserId.mockResolvedValue(['t1'])
    push.send.mockResolvedValue({ invalidTokens: [] })
    await new NotifyNewMessageUseCase(repo, push).execute({ ...input, content: 'a'.repeat(500) })
    const body = push.send.mock.calls[0][0][0].body
    expect(body.length).toBeLessThanOrEqual(140)
    expect(body.endsWith('…')).toBe(true)
  })

  it('apaga os tokens que o Expo disse que não existem mais', async () => {
    const repo = makeRepo()
    const push = makePush()
    repo.findByUserId.mockResolvedValue(['t1', 't2'])
    push.send.mockResolvedValue({ invalidTokens: ['t2'] })
    await new NotifyNewMessageUseCase(repo, push).execute(input)
    expect(repo.removeMany).toHaveBeenCalledWith(['t2'])
  })

  it('falha no envio não propaga (a mensagem já foi salva)', async () => {
    const repo = makeRepo()
    const push = makePush()
    repo.findByUserId.mockResolvedValue(['t1'])
    push.send.mockRejectedValue(new Error('expo fora do ar'))
    await expect(new NotifyNewMessageUseCase(repo, push).execute(input)).resolves.toBeUndefined()
  })
})
