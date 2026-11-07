/**
 * Any x402Client from @x402/fetch, @x402/axios or @x402/core 2.x (typed structurally so
 * ESM and CommonJS copies of @x402/core both fit).
 */
export interface X402ClientLike {
  onBeforePaymentCreation(
    hook: (context: { paymentRequired: any; selectedRequirements: any }) => Promise<void | { abort: true; reason: string }>,
  ): unknown;
}

export declare const TOLCA_CHECK_URL: string;
export declare const TOLCA_PAY_TO: string;

/** Tolca's verdict on the seller's payment request. */
export type SafePayVerdict = "allow" | "review" | "block";

/** The JSON answer of POST /v1/payment-check (main fields; more may be present). */
export interface PaymentCheckResult {
  action: SafePayVerdict;
  risk_score?: number;
  reasons?: string[];
  valid_until?: string;
  invoice_sha256?: string;
  receipt?: unknown;
  [key: string]: unknown;
}

/** The payment option the x402 client selected and is about to sign. */
export interface SafePayPaymentInfo {
  x402Version: number;
  network: string;
  payTo: string;
  asset: string;
  /** Atomic units, as a string. */
  amount: string;
  resource: string | null;
}

export interface SafePayDecision extends SafePayPaymentInfo {
  /** true: the payment goes ahead. false: nothing is signed or paid. */
  allowed: boolean;
  /** Tolca's verdict, or null when no check ran (trusted wallet, check call, error). */
  verdict: SafePayVerdict | null;
  source: "tolca" | "cache" | "trusted" | "checker" | "error";
  check: PaymentCheckResult | null;
  reason: string;
  /** ISO timestamp. */
  at: string;
}

export interface SafePayCacheEntry {
  at: number;
  maxAmount: string;
  check: PaymentCheckResult;
}

/** Any Map-like store (sync or async), e.g. a Map, Redis or a database wrapper. */
export interface SafePayCache {
  get(key: string): SafePayCacheEntry | undefined | Promise<SafePayCacheEntry | undefined>;
  set(key: string, value: SafePayCacheEntry): unknown;
}

export interface SafePayOptions {
  /** Called on a review verdict. Return true to pay anyway. Default: never pays. */
  onReview?: (check: PaymentCheckResult, payment: SafePayPaymentInfo) => boolean | Promise<boolean>;
  /** Called for every decision (log it, keep the receipt). */
  onDecision?: (decision: SafePayDecision) => void;
  /** How long a verdict is reused for the same network + wallet + asset. Default 24 h. 0 = check every payment. */
  cacheTtlMs?: number;
  cache?: SafePayCache;
  /** Wallets you trust (your own services): paid without a check. */
  trustedPayTo?: string[];
  /** Pay when Tolca cannot be reached. Default false: nothing is paid. */
  failOpen?: boolean;
  /** Most you accept to pay for one check, in USD. Default 0.01. */
  maxCheckPriceUsd?: number | string;
  /** Optional seller company to screen against sanctions lists. */
  sellerInfo?: (
    payment: SafePayPaymentInfo,
  ) => { name?: string; country?: string } | undefined | Promise<{ name?: string; country?: string } | undefined>;
  /** Timeout for the check call. Default 30000 ms. */
  timeoutMs?: number;
  /** fetch used for the check call. Default globalThis.fetch. */
  fetch?: typeof globalThis.fetch;
  /** Advanced: another payment-check endpoint and its wallet. */
  checkUrl?: string;
  checkerPayTo?: string;
}

export declare class SafePayError extends Error {
  readonly decision: SafePayDecision;
  constructor(message: string, decision: SafePayDecision, options?: { cause?: unknown });
}

/** Adds the check to an x402Client (works with @x402/fetch, @x402/axios and anything built on x402Client). */
export declare function withSafePay<C extends X402ClientLike>(client: C, options?: SafePayOptions): C;

/** Drop-in for wrapFetchWithPayment(fetch, client). Throws SafePayError when a payment is stopped. */
export declare function wrapFetchWithSafePay(
  fetch: typeof globalThis.fetch,
  client: X402ClientLike,
  options?: SafePayOptions,
): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/** The decision behind an error thrown by an x402 wrapper, or null if it was not a stopped payment. */
export declare function getSafePayDecision(error: unknown): SafePayDecision | null;
