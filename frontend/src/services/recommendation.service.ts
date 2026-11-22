import type { RecommendationDTO } from '@/types/backend';
import { auctionService } from './auction.service';
import { ApiError } from './api';

export type RecommendationStatus = 'idle' | 'loading' | 'ready' | 'unavailable';
export interface RecommendationSink {
  result: (dto: RecommendationDTO) => void;
  status: (status: RecommendationStatus) => void;
}
type Fetch = (roomCode: string, signal: AbortSignal) => Promise<RecommendationDTO>;

export const MIN_INTERVAL_MS = 1500;
export const MAX_RATE_LIMIT_RETRIES = 3;
const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30000;

/**
 * The only place that calls GET /rooms/:code/recommendation.
 * One key (room|activation|bid) maps to at most one in-flight request, one cached result and a capped retry budget.
 * Failures only change the recommendation status; they never touch room or auction state.
 */
export class RecommendationFetcher {
  private key: string | null = null;
  private controller: AbortController | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private lastStart = 0;
  private retries = 0;
  private serverRetried = false;
  constructor(private fetchOne: Fetch = (code, signal) => auctionService.recommendation(code, signal)) {}

  /** No-op when `key` was already requested (in flight, cached, retrying or given up). */
  request(roomCode: string, key: string, sink: RecommendationSink): void {
    if (key === this.key) return;
    this.cancel();
    this.key = key;
    this.retries = 0;
    this.serverRetried = false;
    sink.status('loading');
    const wait = Math.max(0, this.lastStart + MIN_INTERVAL_MS - Date.now());
    this.schedule(wait, () => this.run(roomCode, key, sink));
  }

  /** Stops timers and aborts the in-flight request; the next request() with any key starts fresh. */
  cancel(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.controller?.abort();
    this.controller = undefined;
  }

  reset(): void {
    this.cancel();
    this.key = null;
  }

  private schedule(ms: number, fn: () => void) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = undefined; fn(); }, ms);
  }

  private run(roomCode: string, key: string, sink: RecommendationSink) {
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    this.lastStart = Date.now();
    this.fetchOne(roomCode, controller.signal).then(dto => {
      if (this.key !== key || controller.signal.aborted) return;
      sink.result(dto);
      sink.status('ready');
    }).catch(error => {
      if (this.key !== key || controller.signal.aborted) return;
      const delay = this.retryDelay(error);
      if (delay === null) { sink.status('unavailable'); return; }
      this.schedule(delay, () => this.run(roomCode, key, sink));
    });
  }

  /** ms until the next attempt, or null when the error must not be retried. */
  private retryDelay(error: unknown): number | null {
    const status = error instanceof ApiError ? error.status : undefined;
    const jitter = (ms: number) => ms * (1 + Math.random() * 0.25);
    if (status === 429) {
      if (this.retries >= MAX_RATE_LIMIT_RETRIES) return null;
      const backoff = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** this.retries++);
      return jitter(Math.max(backoff, error instanceof ApiError ? error.retryAfterMs ?? 0 : 0));
    }
    const transient = (status !== undefined && status >= 500) || (error instanceof ApiError && error.code === 'NETWORK_ERROR');
    if (transient && !this.serverRetried) { this.serverRetried = true; return jitter(2000); }
    return null;
  }
}

export const recommendationFetcher = new RecommendationFetcher();
