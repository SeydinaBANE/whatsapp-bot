import { describe, it, expect, afterEach } from 'vitest'
import { requireEnv } from './env'

const ORIGINAL_ENV = { ...process.env }

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe('requireEnv', () => {
  it('retourne la valeur si la variable est définie', () => {
    process.env.SOME_VAR = 'hello'
    expect(requireEnv('SOME_VAR')).toBe('hello')
  })

  it('lève une erreur claire si la variable est absente', () => {
    delete process.env.SOME_VAR
    expect(() => requireEnv('SOME_VAR')).toThrow('Missing required environment variable: SOME_VAR')
  })

  it('lève une erreur si la variable est une chaîne vide', () => {
    process.env.SOME_VAR = ''
    expect(() => requireEnv('SOME_VAR')).toThrow('Missing required environment variable: SOME_VAR')
  })
})
