export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret || secret.trim() === '') {
    throw new Error('FALTA CONFIGURACIÓN: La variable de entorno JWT_SECRET es obligatoria para arrancar la aplicación.')
  }
  return secret
}
