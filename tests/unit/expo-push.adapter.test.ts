import { ExpoPushAdapter } from '../../src/adapters/services/expo-push.adapter'

const ok = (data: object[]) => new Response(JSON.stringify({ data }), { status: 200 })

describe('ExpoPushAdapter', () => {
  it('faz POST no endpoint do Expo com as mensagens', async () => {
    const fetchFn = jest.fn().mockResolvedValue(ok([{ status: 'ok' }]))
    const msgs = [{ to: 't1', title: 'a', body: 'b', data: { chatId: 'c' } }]
    await new ExpoPushAdapter(fetchFn as any).send(msgs)
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://exp.host/--/api/v2/push/send')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual([{ ...msgs[0], sound: 'default' }])
  })

  it('devolve como inválidos os tokens com DeviceNotRegistered', async () => {
    const fetchFn = jest.fn().mockResolvedValue(
      ok([
        { status: 'ok' },
        { status: 'error', details: { error: 'DeviceNotRegistered' } },
        { status: 'error', details: { error: 'MessageRateExceeded' } },
      ]),
    )
    const msgs = ['a', 'b', 'c'].map((to) => ({ to, title: 't', body: 'b', data: {} }))
    const res = await new ExpoPushAdapter(fetchFn as any).send(msgs)
    expect(res.invalidTokens).toEqual(['b'])
  })

  it('lista vazia não chama a rede', async () => {
    const fetchFn = jest.fn()
    expect(await new ExpoPushAdapter(fetchFn as any).send([])).toEqual({ invalidTokens: [] })
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('resposta não-2xx lança erro', async () => {
    const fetchFn = jest.fn().mockResolvedValue(new Response('x', { status: 500 }))
    await expect(new ExpoPushAdapter(fetchFn as any).send([{ to: 'a', title: 't', body: 'b', data: {} }])).rejects.toThrow()
  })
})
