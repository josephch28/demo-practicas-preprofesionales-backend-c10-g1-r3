export interface Checkpoint {
  updatedAt: string | Date
  id: number
}

export function encodeCheckpoint(cp: Checkpoint): string {
  const normalized = {
    ...cp,
    updatedAt: cp.updatedAt instanceof Date ? cp.updatedAt.toISOString() : cp.updatedAt,
  }
  return Buffer.from(JSON.stringify(normalized), 'utf8').toString('base64')
}

export function decodeCheckpoint(raw: string | undefined): Checkpoint | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'))
    if (typeof parsed?.updatedAt !== 'string' || typeof parsed?.id !== 'number') return null
    return { updatedAt: parsed.updatedAt, id: parsed.id }
  } catch {
    return null
  }
}
