import { ChatService } from '../../src/adapters/services/chat.service'
import type { IChatRepository } from '../../src/domain/interfaces/chat.repository.interface'

const makeRepo = () =>
  ({
    findParticipants: jest.fn().mockResolvedValue({
      candidateUserId: 'cand',
      recruiterUserId: 'rec',
      companyName: 'Nubloom',
    }),
    countRecruiterMessages: jest.fn().mockResolvedValue(1),
    createMessage: jest
      .fn()
      .mockResolvedValue({ id: 'm1', chatId: 'c1', senderId: 'rec', content: 'oi', createdAt: new Date(), readAt: null }),
  }) as unknown as jest.Mocked<IChatRepository>

describe('ChatService.sendMessage → notificação', () => {
  it('recrutador escreve: avisa o candidato com o nome da empresa', async () => {
    const notify = { execute: jest.fn().mockResolvedValue(undefined) }
    await new ChatService(makeRepo(), notify).sendMessage('c1', 'rec', 'oi')
    expect(notify.execute).toHaveBeenCalledWith({ recipientUserId: 'cand', chatId: 'c1', title: 'Nubloom', content: 'oi' })
  })

  it('candidato escreve: não notifica (não há app de recrutador ainda)', async () => {
    const notify = { execute: jest.fn() }
    await new ChatService(makeRepo(), notify).sendMessage('c1', 'cand', 'olá')
    expect(notify.execute).not.toHaveBeenCalled()
  })

  it('erro na notificação não derruba o envio', async () => {
    const notify = { execute: jest.fn().mockRejectedValue(new Error('boom')) }
    const msg = await new ChatService(makeRepo(), notify).sendMessage('c1', 'rec', 'oi')
    expect(msg.id).toBe('m1')
  })

  it('sem notificador configurado continua funcionando', async () => {
    const msg = await new ChatService(makeRepo()).sendMessage('c1', 'rec', 'oi')
    expect(msg.id).toBe('m1')
  })
})
