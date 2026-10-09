import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getJwtExpiresIn, getJwtSecret } from './jwt-secret'

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

describe('getJwtExpiresIn', () => {
  const originalExpiresIn = process.env.JWT_EXPIRES_IN

  afterEach(() => {
    if (originalExpiresIn !== undefined) {
      process.env.JWT_EXPIRES_IN = originalExpiresIn
    } else {
      delete process.env.JWT_EXPIRES_IN
    }
  })

  it('defaults to 15m when JWT_EXPIRES_IN is not defined', () => {
    delete process.env.JWT_EXPIRES_IN

    expect(getJwtExpiresIn()).toBe('15m')
  })

  it('defaults to 15m when JWT_EXPIRES_IN is empty or whitespace', () => {
    process.env.JWT_EXPIRES_IN = '   '

    expect(getJwtExpiresIn()).toBe('15m')
  })

  it('returns configured value when JWT_EXPIRES_IN is provided', () => {
    process.env.JWT_EXPIRES_IN = '30m'

    expect(getJwtExpiresIn()).toBe('30m')
  })
})
