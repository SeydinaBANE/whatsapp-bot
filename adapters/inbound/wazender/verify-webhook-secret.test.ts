import { describe, it, expect } from 'vitest'
import { isAuthorizedWebhookRequest } from './verify-webhook-secret'

describe('isAuthorizedWebhookRequest', () => {
  it('autorise si le token en query param correspond au secret attendu', () => {
    const url = new URL('https://bot.example.com/api/webhook?token=s3cr3t')
    expect(isAuthorizedWebhookRequest(url, 's3cr3t')).toBe(true)
  })

  it('refuse si le token est absent', () => {
    const url = new URL('https://bot.example.com/api/webhook')
    expect(isAuthorizedWebhookRequest(url, 's3cr3t')).toBe(false)
  })

  it('refuse si le token ne correspond pas', () => {
    const url = new URL('https://bot.example.com/api/webhook?token=wrong')
    expect(isAuthorizedWebhookRequest(url, 's3cr3t')).toBe(false)
  })
})
