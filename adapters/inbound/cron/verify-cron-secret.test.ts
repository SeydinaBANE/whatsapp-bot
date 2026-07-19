import { describe, it, expect } from 'vitest'
import { isAuthorizedCronRequest } from './verify-cron-secret'

describe('isAuthorizedCronRequest', () => {
  it('autorise si le header Authorization correspond au secret attendu', () => {
    expect(isAuthorizedCronRequest('Bearer s3cr3t', 's3cr3t')).toBe(true)
  })

  it('refuse si le header est absent', () => {
    expect(isAuthorizedCronRequest(null, 's3cr3t')).toBe(false)
  })

  it('refuse si le header ne correspond pas', () => {
    expect(isAuthorizedCronRequest('Bearer wrong', 's3cr3t')).toBe(false)
  })
})
