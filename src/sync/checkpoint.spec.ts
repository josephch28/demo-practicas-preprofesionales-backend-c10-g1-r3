import { describe, expect, it } from 'vitest'
import { decodeCheckpoint, encodeCheckpoint } from './checkpoint'

describe('checkpoint', () => {
  it('round-trips a checkpoint through base64', () => {
    const cp = { updatedAt: '2026-04-01T12:00:00.000Z', id: 42 }

    expect(decodeCheckpoint(encodeCheckpoint(cp))).toEqual(cp)
  })

  it('handles Date objects by normalizing to ISO string', () => {
    const cp = { updatedAt: new Date('2026-04-01T12:00:00.000Z'), id: 42 }
    const expected = { updatedAt: '2026-04-01T12:00:00.000Z', id: 42 }
    expect(decodeCheckpoint(encodeCheckpoint(cp))).toEqual(expected)
  })

  it('returns null for a missing or malformed cursor', () => {
    expect(decodeCheckpoint(undefined)).toBeNull()
    expect(decodeCheckpoint('no-es-base64-valido!!')).toBeNull()
  })
})
