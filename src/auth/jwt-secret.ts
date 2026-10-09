export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret || secret.trim() === '') {
    throw new Error('FALTA CONFIGURACIÓN: La variable de entorno JWT_SECRET es obligatoria para arrancar la aplicación.')
  }
  return secret
}

export function getJwtExpiresIn(): string {
  const expiresIn = process.env.JWT_EXPIRES_IN
  if (expiresIn && expiresIn.trim() !== '') {
    return expiresIn.trim()
  }
  return '15m'
}

