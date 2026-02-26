/**
 * Simple in-memory circuit breaker.
 *
 * Protects downstream services (e.g. OpenRouter) from cascading failures
 * and prevents runaway costs on repeated errors.
 *
 * States:
 *  CLOSED   – normal operation; all calls pass through
 *  OPEN     – too many consecutive failures; calls are rejected immediately
 *  HALF_OPEN – cooldown elapsed; one test call is allowed through
 *              success → CLOSED | failure → OPEN
 *
 * Usage:
 *   const breaker = new CircuitBreaker({ failureThreshold: 3, resetTimeout: 60_000 });
 *   if (!breaker.canCall()) return null;          // fast-fail when OPEN
 *   try {
 *     const result = await callExternalService();
 *     breaker.recordSuccess();
 *     return result;
 *   } catch (err) {
 *     breaker.recordFailure();
 *     throw err;
 *   }
 */

type State = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitBreakerOptions {
  /** Number of consecutive failures before the breaker opens. Default: 3 */
  failureThreshold?: number;
  /** Milliseconds to wait before transitioning OPEN → HALF_OPEN. Default: 60_000 */
  resetTimeout?: number;
}

export class CircuitBreaker {
  private state: State = 'CLOSED';
  private failureCount = 0;
  private openedAt: number | null = null;

  private readonly failureThreshold: number;
  private readonly resetTimeout: number;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 3;
    this.resetTimeout = options.resetTimeout ?? 60_000;
  }

  /**
   * Returns true if a call should be allowed through.
   * Call this BEFORE attempting the external request.
   */
  canCall(): boolean {
    if (this.state === 'CLOSED') return true;

    if (this.state === 'OPEN') {
      const elapsed = Date.now() - (this.openedAt ?? 0);
      if (elapsed >= this.resetTimeout) {
        this.state = 'HALF_OPEN';
        return true; // allow the single test call
      }
      return false;
    }

    // HALF_OPEN: we're already letting one test call through
    return true;
  }

  /** Call after a successful external request. */
  recordSuccess(): void {
    this.failureCount = 0;
    this.openedAt = null;
    this.state = 'CLOSED';
  }

  /** Call after a failed external request. */
  recordFailure(): void {
    this.failureCount++;
    if (this.state === 'HALF_OPEN' || this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      this.openedAt = Date.now();
    }
  }

  getState(): State {
    return this.state;
  }

  getFailureCount(): number {
    return this.failureCount;
  }
}
