import { describe, it, expect } from 'vitest'
import { parseIncoming, type WazenderWebhookPayload } from './parse-incoming'

function makePayload(overrides: Partial<{
  event: string
  fromMe: boolean
  phone: string
  body: string
  id: string
}> = {}): WazenderWebhookPayload {
  const { event = 'messages.received', fromMe = false, phone = '+221771234567', body = 'Bonjour', id = 'MSG1' } = overrides
  return {
    event,
    timestamp: 1748000000000,
    data: {
      messages: {
        key: { id, fromMe, remoteJid: 'test@s.whatsapp.net', cleanedSenderPn: phone },
        messageBody: body,
      },
    },
  }
}

describe('parseIncoming', () => {
  it('retourne le message pour un payload valide', () => {
    const result = parseIncoming(makePayload())
    expect(result).toEqual({ phone: '+221771234567', text: 'Bonjour', messageId: 'MSG1' })
  })

  it('retourne null si fromMe est true', () => {
    expect(parseIncoming(makePayload({ fromMe: true }))).toBeNull()
  })

  it('retourne null si event !== messages.received', () => {
    expect(parseIncoming(makePayload({ event: 'connection.update' }))).toBeNull()
    expect(parseIncoming(makePayload({ event: 'qr.update' }))).toBeNull()
  })

  it('retourne null si le corps du message est vide', () => {
    expect(parseIncoming(makePayload({ body: '' }))).toBeNull()
    expect(parseIncoming(makePayload({ body: '   ' }))).toBeNull()
  })

  it('retourne null si le numéro de téléphone est absent', () => {
    expect(parseIncoming(makePayload({ phone: '' }))).toBeNull()
  })

  it('trim le texte du message', () => {
    const result = parseIncoming(makePayload({ body: '  Salut  ' }))
    expect(result?.text).toBe('Salut')
  })
})
