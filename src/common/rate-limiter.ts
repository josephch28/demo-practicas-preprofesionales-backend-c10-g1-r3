import { HttpException, HttpStatus } from '@nestjs/common'

/**
 * Límite por usuario en una ventana deslizante, en memoria (un solo proceso).
 * Si se supera lanza un 429 con el mensaje que le pase cada endpoint.
 */
export class RateLimiter {
  private readonly requestTimes = new Map<number, number[]>()

  constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number,
    private readonly message: string,
  ) {}

  assertWithinLimit(userId: number): void {
    const now = Date.now()
    const recent = (this.requestTimes.get(userId) ?? []).filter((time) => now - time < this.windowMs)
    if (recent.length >= this.maxRequests) {
      this.requestTimes.set(userId, recent)
      throw new HttpException(this.message, HttpStatus.TOO_MANY_REQUESTS)
    }
    recent.push(now)
    this.requestTimes.set(userId, recent)
  }
}
