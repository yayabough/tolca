// tolca-safe-pay: check an x402 seller with Tolca payment-check before your agent pays it.
// https://github.com/yayabough/tolca/tree/main/safe-pay
import { wrapFetchWithPayment, x402HTTPClient } from "@x402/fetch";

export const TOLCA_CHECK_URL = "https://tolca.tonbot.ca/v1/payment-check";
export const TOLCA_PAY_TO = "0x35F0B86a7E33F561faf7cfa5654CAd9162C4A17d";
const BASE_NETWORK = "eip155:8453";
const BASE_USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const DAY_MS = 24 * 60 * 60 * 1000;
const VERDICTS = new Set(["allow", "review", "block"]);
const MARK = "tolca-safe-pay#";

/** Thrown by wrapFetchWithSafePay when a payment is stopped. `decision` says why. */
export class SafePayError extends Error {
  constructor(message, decision, options) {
    super(message, options);
    this.name = "SafePayError";
    this.decision = decision;
  }
}

// Recent stopped decisions, so an error thrown by the x402 wrapper can be traced back.
const stopped = new Map();
let nextId = 1;
function remember(decision) {
  const id = String(nextId++);
  stopped.set(id, decision);
  if (stopped.size > 200) stopped.delete(stopped.keys().next().value);
  return id;
}

/** Returns the decision behind an error thrown by an x402 wrapper, or null. */
export function getSafePayDecision(error) {
  if (error instanceof SafePayError) return error.decision;
  for (let e = error, depth = 0; e && depth < 5; e = e.cause, depth++) {
    const m = new RegExp(MARK + "(\\d+)").exec(String(e.message ?? e));
    if (m) return stopped.get(m[1]) ?? null;
  }
  return null;
}

const lower = (s) => String(s ?? "").toLowerCase();

function toAtomicUsdc(usd) {
  const [whole, frac = ""] = String(usd).split(".");
  return BigInt(whole || "0") * 1000000n + BigInt((frac + "000000").slice(0, 6));
}

function describe(paymentRequired, req) {
  return {
    x402Version: Number(paymentRequired?.x402Version ?? 2),
    network: String(req?.network ?? ""),
    payTo: String(req?.payTo ?? ""),
    asset: String(req?.asset ?? ""),
    amount: String(req?.amount ?? req?.maxAmountRequired ?? "0"),
    resource: paymentRequired?.resource?.url ?? req?.resource ?? null,
  };
}

function amountOf(info) {
  try {
    return BigInt(info.amount);
  } catch {
    return -1n;
  }
}

const guarded = new WeakSet();

/**
 * Adds the safety check to an x402Client. Before the first payment to a new seller wallet,
 * the client asks Tolca payment-check ($0.01, paid with the same client) and then:
 * allow -> pays, review -> asks onReview (default: does not pay), block -> does not pay.
 */
export function withSafePay(client, options = {}) {
  if (!client || typeof client.onBeforePaymentCreation !== "function") {
    throw new TypeError("withSafePay needs an x402Client from @x402/fetch or @x402/core 2.x");
  }
  if (guarded.has(client)) return client;
  guarded.add(client);

  const o = {
    checkUrl: options.checkUrl ?? TOLCA_CHECK_URL,
    checkerPayTo: lower(options.checkerPayTo ?? TOLCA_PAY_TO),
    maxCheckAtomic: toAtomicUsdc(options.maxCheckPriceUsd ?? 0.01),
    cacheTtlMs: options.cacheTtlMs ?? DAY_MS,
    cache: options.cache ?? new Map(),
    trusted: new Set((options.trustedPayTo ?? []).map(lower)),
    onReview: options.onReview ?? (() => false),
    onDecision: options.onDecision,
    failOpen: options.failOpen === true,
    timeoutMs: options.timeoutMs ?? 30000,
    fetch: options.fetch ?? globalThis.fetch,
    sellerInfo: options.sellerInfo,
  };
  const inflight = new Map();
  const ownCheckPayments = new WeakSet(); // 402s of our own check calls, already validated
  let httpClient;
  const http = () => (httpClient ??= new x402HTTPClient(client));
  const isCheckerTerms = (i) =>
    lower(i.payTo) === o.checkerPayTo &&
    i.network === BASE_NETWORK &&
    lower(i.asset) === BASE_USDC &&
    amountOf(i) >= 0n &&
    amountOf(i) <= o.maxCheckAtomic;

  const finish = (info, d) => {
    const decision = { ...info, ...d, at: new Date().toISOString() };
    if (o.onDecision) {
      try {
        o.onDecision(decision);
      } catch {
        // a logging callback must never change the payment decision
      }
    }
    if (decision.allowed) return undefined;
    const id = remember(decision);
    return { abort: true, reason: `${MARK}${id} ${decision.reason}` };
  };

  // Pays for the check by hand, so its terms are validated before anything is signed
  // and the call never loops back into the seller check.
  async function postCheck(bodyText) {
    const headers = { "content-type": "application/json", accept: "application/json" };
    const signal = AbortSignal.timeout(o.timeoutMs);
    const first = await o.fetch(o.checkUrl, { method: "POST", headers, body: bodyText, signal });
    if (first.status !== 402) return first;
    const raw = await first.text();
    let parsed;
    try {
      parsed = raw ? JSON.parse(raw) : undefined;
    } catch {
      parsed = undefined;
    }
    const pr = http().getPaymentRequiredResponse((n) => first.headers.get(n), parsed);
    const accepts = (pr?.accepts ?? []).filter((r) => isCheckerTerms(describe(pr, r)));
    if (!accepts.length) throw new Error("unexpected price, asset or wallet on the payment-check call: nothing paid");
    const own = { ...pr, accepts };
    ownCheckPayments.add(own);
    const payload = await client.createPaymentPayload(own);
    const payHeaders = http().encodePaymentSignatureHeader(payload);
    return o.fetch(o.checkUrl, { method: "POST", headers: { ...headers, ...payHeaders }, body: bodyText, signal });
  }

  async function runCheck(info, paymentRequired) {
    const body =
      info.x402Version >= 2
        ? { payment_required: paymentRequired, network: info.network }
        : {
            requirements: { network: info.network, asset: info.asset, payTo: info.payTo, amount: info.amount, resource: info.resource },
            network: info.network,
          };
    if (o.sellerInfo) {
      const s = await o.sellerInfo(info);
      if (s?.name) body.seller_name = String(s.name).slice(0, 160);
      if (s?.country) body.seller_country = String(s.country).slice(0, 2).toUpperCase();
    }
    const res = await postCheck(JSON.stringify(body));
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      // handled below
    }
    if (!res.ok || !json || !VERDICTS.has(json.action)) {
      const why = json?.error ?? json?.message ?? text.slice(0, 200);
      throw new Error(`payment-check answered HTTP ${res.status}${why ? `: ${why}` : ""}`);
    }
    return json;
  }

  async function verdictFor(info, paymentRequired) {
    const key = `${lower(info.network)}|${lower(info.payTo)}|${lower(info.asset)}`;
    const now = Date.now();
    if (o.cacheTtlMs > 0) {
      const hit = await o.cache.get(key);
      if (hit && now - hit.at < o.cacheTtlMs && amountOf(info) <= BigInt(hit.maxAmount)) {
        return { check: hit.check, source: "cache" };
      }
    }
    if (inflight.has(key)) return inflight.get(key);
    const p = (async () => {
      const check = await runCheck(info, paymentRequired);
      if (o.cacheTtlMs > 0) await o.cache.set(key, { at: Date.now(), maxAmount: info.amount, check });
      return { check, source: "tolca" };
    })();
    inflight.set(key, p);
    try {
      return await p;
    } finally {
      inflight.delete(key);
    }
  }

  client.onBeforePaymentCreation(async ({ paymentRequired, selectedRequirements }) => {
    const info = describe(paymentRequired, selectedRequirements);

    // The $0.01 payment for the check itself: Tolca's wallet, official USDC on Base, capped price.
    if (ownCheckPayments.has(paymentRequired)) {
      const ok = isCheckerTerms(info);
      return finish(info, {
        allowed: ok,
        verdict: null,
        source: "checker",
        check: null,
        reason: ok ? "payment for the payment-check call" : "unexpected price, asset or wallet on the payment-check call: nothing paid",
      });
    }

    if (o.trusted.has(lower(info.payTo))) {
      return finish(info, { allowed: true, verdict: null, source: "trusted", check: null, reason: "payTo is in trustedPayTo" });
    }

    let result;
    try {
      result = await verdictFor(info, paymentRequired);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return finish(info, {
        allowed: o.failOpen,
        verdict: null,
        source: "error",
        check: null,
        reason: o.failOpen ? `check failed, paid anyway (failOpen): ${msg}` : `check failed, nothing paid: ${msg}`,
      });
    }

    const { check, source } = result;
    const reasons = Array.isArray(check.reasons) ? check.reasons.join(" | ") : "";
    const risk = check.risk_score != null ? ` (risk ${check.risk_score})` : "";
    if (check.action === "allow") {
      return finish(info, { allowed: true, verdict: "allow", source, check, reason: `allow${risk}` });
    }
    if (check.action === "review") {
      let ok = false;
      try {
        ok = (await o.onReview(check, info)) === true;
      } catch {
        ok = false;
      }
      return finish(info, {
        allowed: ok,
        verdict: "review",
        source,
        check,
        reason: ok ? `review${risk}, approved by onReview` : `review${risk}, not paid: ${reasons}`,
      });
    }
    return finish(info, { allowed: false, verdict: "block", source, check, reason: `block${risk}, not paid: ${reasons}` });
  });

  return client;
}

/**
 * Drop-in for wrapFetchWithPayment(fetch, client): same fetch, with the safety check.
 * A stopped payment throws SafePayError (error.decision has Tolca's answer).
 */
export function wrapFetchWithSafePay(fetchImpl, client, options = {}) {
  const f = fetchImpl ?? globalThis.fetch;
  withSafePay(client, { fetch: f, ...options });
  const paid = wrapFetchWithPayment(f, client);
  return async (input, init) => {
    try {
      return await paid(input, init);
    } catch (err) {
      const decision = getSafePayDecision(err);
      if (decision) throw new SafePayError(`tolca-safe-pay: ${decision.reason}`, decision, { cause: err });
      throw err;
    }
  };
}
