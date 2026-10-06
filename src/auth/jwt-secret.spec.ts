import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getJwtSecret } from './jwt-secret'

describe('getJwtSecret', () => {
  const originalSecret = process.env.JWT_SECRET

  beforeEach(() => {
    delete process.env.JWT_SECRET
  })

  afterEach(() => {
    if (originalSecret !== undefined) {
      process.env.JWT_SECRET = originalSecret
    } else {
      delete process.env.JWT_SECRET
    }
  })

  it('throws an error with exact variable name when JWT_SECRET is not defined', () => {
    delete process.env.JWT_SECRET

    expect(() => getJwtSecret()).toThrowError(
      'FALTA CONFIGURACIÓN: La variable de entorno JWT_SECRET es obligatoria para arrancar la aplicación.',
    )
  })

  it('throws an error when JWT_SECRET is an empty string', () => {
    process.env.JWT_SECRET = ''

    expect(() => getJwtSecret()).toThrowError(
      'FALTA CONFIGURACIÓN: La variable de entorno JWT_SECRET es obligatoria para arrancar la aplicación.',
    )
  })

  it('throws an error when JWT_SECRET consists only of whitespace', () => {
    process.env.JWT_SECRET = '   '

    expect(() => getJwtSecret()).toThrowError(
      'FALTA CONFIGURACIÓN: La variable de entorno JWT_SECRET es obligatoria para arrancar la aplicación.',
    )
  })

  it('returns the secret when JWT_SECRET is provided', () => {
    process.env.JWT_SECRET = 'super-secret-key-12345'

    expect(getJwtSecret()).toBe('super-secret-key-12345')
  })
})
