// Offline tests: a mock seller and a mock Tolca checker speak x402 v2 over local HTTP.
// A fake scheme "signs" payments, so no wallet, chain or real money is involved.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { x402Client } from "@x402/fetch";
import { wrapFetchWithSafePay, withSafePay, SafePayError, getSafePayDecision, TOLCA_PAY_TO } from "../index.js";
import { wrapFetchWithPayment } from "@x402/fetch";

const BASE = "eip155:8453";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const GOOD = "0x1111111111111111111111111111111111111111";
const BAD = "0x2222222222222222222222222222222222222222";
const MEH = "0x3333333333333333333333333333333333333333";

const state = {
  checks: [], // bodies received by the checker (paid)
  sellerPaid: 0,
  checkerAmount: "10000",
  checkerPayTo: TOLCA_PAY_TO,
  checkerDown: false,
  checkerResource: null,
  sellerPrice: {}, // path -> amount
  delayMs: 0,
};

function reset() {
  state.checks = [];
  state.sellerPaid = 0;
  state.checkerAmount = "10000";
  state.checkerPayTo = TOLCA_PAY_TO;
  state.checkerDown = false;
  state.checkerResource = null;
  state.delayMs = 0;
}

function send402(res, url, payTo, amount) {
  const pr = {
    x402Version: 2,
    error: "Payment required",
    resource: { url, description: "test", mimeType: "application/json" },
    accepts: [{ scheme: "exact", network: BASE, asset: USDC, amount, payTo, maxTimeoutSeconds: 60, extra: { name: "USD Coin", version: "2" } }],
  };
  res.writeHead(402, { "content-type": "application/json", "payment-required": Buffer.from(JSON.stringify(pr)).toString("base64") });
  res.end(JSON.stringify({}));
}

let server;
let origin;
before(async () => {
  server = http.createServer(async (req, res) => {
    let body = "";
    for await (const c of req) body += c;
    const url = new URL(req.url, origin);
    const paid = Boolean(req.headers["payment-signature"]);

    if (url.pathname === "/v1/payment-check") {
      if (state.checkerDown) {
        res.writeHead(503).end("down");
        return;
      }
      if (!paid) return send402(res, state.checkerResource ?? `${origin}/v1/payment-check`, state.checkerPayTo, state.checkerAmount);
      const j = JSON.parse(body);
      state.checks.push(j);
      if (state.delayMs) await new Promise((r) => setTimeout(r, state.delayMs));
      const payTo = j.payment_required?.accepts?.[0]?.payTo ?? j.requirements?.payTo;
      const action = payTo === GOOD ? "allow" : payTo === BAD ? "block" : "review";
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ action, risk_score: action === "allow" ? 5 : 80, reasons: [`test verdict ${action}`], valid_until: new Date(Date.now() + 600000).toISOString() }));
      return;
    }

    // Seller: /seller/<wallet>
    const wallet = url.pathname.split("/")[2];
    const amount = state.sellerPrice[url.pathname] ?? "5000";
    if (!paid) return send402(res, `${origin}${url.pathname}`, wallet, amount);
    state.sellerPaid++;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

function makeClient() {
  const fakeScheme = {
    scheme: "exact",
    async createPaymentPayload(x402Version, requirements) {
      return { x402Version, payload: { signature: "0xfake", to: requirements.payTo } };
    },
  };
  // The fake scheme does not know USDC, so the built-in spend cap is turned off for tests.
  return new x402Client().register(BASE, fakeScheme).setSpendControls(false);
}

function safeFetch(opts = {}) {
  return wrapFetchWithSafePay(fetch, makeClient(), { checkUrl: `${origin}/v1/payment-check`, ...opts });
}

test("allow: checks once, pays the seller, reuses the verdict", async () => {
  reset();
  const decisions = [];
  const f = safeFetch({ onDecision: (d) => decisions.push(d) });
  const r1 = await f(`${origin}/seller/${GOOD}`);
  assert.equal(r1.status, 200);
  const r2 = await f(`${origin}/seller/${GOOD}`);
  assert.equal(r2.status, 200);
  assert.equal(state.checks.length, 1, "one paid check for two payments");
  assert.equal(state.sellerPaid, 2);
  const sellerDecisions = decisions.filter((d) => d.source !== "checker");
  assert.deepEqual(sellerDecisions.map((d) => d.source), ["tolca", "cache"]);
  assert.ok(state.checks[0].payment_required, "sends the seller's 402");
  assert.equal(state.checks[0].network, BASE);
});

test("block: throws SafePayError and pays nothing to the seller", async () => {
  reset();
  const f = safeFetch();
  await assert.rejects(f(`${origin}/seller/${BAD}`), (err) => {
    assert.ok(err instanceof SafePayError);
    assert.equal(err.decision.verdict, "block");
    assert.equal(err.decision.allowed, false);
    assert.match(err.message, /test verdict block/);
    return true;
  });
  assert.equal(state.sellerPaid, 0);
  assert.equal(state.checks.length, 1);
});

test("review: not paid by default, paid when onReview says yes", async () => {
  reset();
  await assert.rejects(safeFetch()(`${origin}/seller/${MEH}`), (err) => err.decision?.verdict === "review");
  assert.equal(state.sellerPaid, 0);
  const seen = [];
  const f = safeFetch({ onReview: (check, p) => (seen.push([check.action, p.payTo]), true) });
  const r = await f(`${origin}/seller/${MEH}`);
  assert.equal(r.status, 200);
  assert.equal(state.sellerPaid, 1);
  assert.deepEqual(seen, [["review", MEH]]);
});

test("price goes up on a known seller: checks again", async () => {
  reset();
  const f = safeFetch();
  const path = `/seller/${GOOD}`;
  state.sellerPrice[path] = "5000";
  await f(`${origin}${path}`);
  state.sellerPrice[path] = "900000";
  await f(`${origin}${path}`);
  state.sellerPrice[path] = "4000";
  await f(`${origin}${path}`);
  delete state.sellerPrice[path];
  assert.equal(state.checks.length, 2, "re-checked only when the price went up");
  assert.equal(state.sellerPaid, 3);
});

test("cacheTtlMs 0: checks every payment", async () => {
  reset();
  const f = safeFetch({ cacheTtlMs: 0 });
  await f(`${origin}/seller/${GOOD}`);
  await f(`${origin}/seller/${GOOD}`);
  assert.equal(state.checks.length, 2);
});

test("check call priced above the cap: nothing paid at all", async () => {
  reset();
  state.checkerAmount = "20000"; // $0.02 > $0.01 cap
  await assert.rejects(safeFetch()(`${origin}/seller/${GOOD}`), (err) => {
    assert.equal(err.decision.source, "error");
    assert.match(err.message, /nothing paid/);
    return true;
  });
  assert.equal(state.checks.length, 0, "checker not paid");
  assert.equal(state.sellerPaid, 0, "seller not paid");
});

test("check call with another wallet: nothing paid at all", async () => {
  reset();
  state.checkerPayTo = "0x9999999999999999999999999999999999999999";
  await assert.rejects(safeFetch()(`${origin}/seller/${GOOD}`), SafePayError);
  assert.equal(state.checks.length, 0);
  assert.equal(state.sellerPaid, 0);
});

test("Tolca unreachable: fail closed by default, failOpen pays", async () => {
  reset();
  state.checkerDown = true;
  await assert.rejects(safeFetch()(`${origin}/seller/${GOOD}`), (err) => err.decision?.source === "error");
  assert.equal(state.sellerPaid, 0);
  const r = await safeFetch({ failOpen: true })(`${origin}/seller/${GOOD}`);
  assert.equal(r.status, 200);
  assert.equal(state.sellerPaid, 1);
});

test("trustedPayTo: paid without a check", async () => {
  reset();
  const r = await safeFetch({ trustedPayTo: [BAD.toUpperCase().replace("0X", "0x")] })(`${origin}/seller/${BAD}`);
  assert.equal(r.status, 200);
  assert.equal(state.checks.length, 0);
});

test("parallel payments to one new seller: one check", async () => {
  reset();
  state.delayMs = 200;
  const f = safeFetch();
  const rs = await Promise.all([1, 2, 3].map(() => f(`${origin}/seller/${GOOD}`)));
  assert.deepEqual(rs.map((r) => r.status), [200, 200, 200]);
  assert.equal(state.checks.length, 1);
});

test("withSafePay works with your own wrapper; getSafePayDecision reads its errors", async () => {
  reset();
  const client = withSafePay(makeClient(), { checkUrl: `${origin}/v1/payment-check` });
  withSafePay(client); // second call is a no-op, no double checks
  const f = wrapFetchWithPayment(fetch, client);
  await assert.rejects(f(`${origin}/seller/${BAD}`), (err) => {
    assert.ok(!(err instanceof SafePayError));
    assert.equal(getSafePayDecision(err)?.verdict, "block");
    return true;
  });
  await f(`${origin}/seller/${GOOD}`);
  assert.equal(state.checks.length, 2);
  assert.equal(getSafePayDecision(new Error("unrelated")), null);
});

test("sellerInfo adds the company to the check", async () => {
  reset();
  await safeFetch({ sellerInfo: () => ({ name: "Example Inc", country: "us" }), cacheTtlMs: 0 })(`${origin}/seller/${GOOD}`);
  assert.equal(state.checks[0].seller_name, "Example Inc");
  assert.equal(state.checks[0].seller_country, "US");
});

test("check call whose 402 names another resource URL: still capped, no deadlock", async () => {
  reset();
  state.checkerResource = "http://proxy.internal/v1/payment-check";
  const decisions = [];
  const r = await safeFetch({ onDecision: (d) => decisions.push(d.source) })(`${origin}/seller/${GOOD}`);
  assert.equal(r.status, 200);
  assert.deepEqual(decisions, ["checker", "tolca"]);
  assert.equal(state.checks.length, 1);
  state.checkerResource = "http://proxy.internal/v1/payment-check";
  state.checkerAmount = "50000";
  await assert.rejects(safeFetch()(`${origin}/seller/${GOOD}`), SafePayError);
  assert.equal(state.checks.length, 1, "over-priced check not paid");
});

test("check call with another wallet and another resource URL: refused fast, nothing signed", async () => {
  reset();
  state.checkerResource = "http://proxy.internal/v1/payment-check";
  state.checkerPayTo = "0x9999999999999999999999999999999999999999";
  const decisions = [];
  const t0 = Date.now();
  await assert.rejects(safeFetch({ onDecision: (d) => decisions.push(d.source) })(`${origin}/seller/${GOOD}`), SafePayError);
  assert.ok(Date.now() - t0 < 2000, "no hang");
  assert.deepEqual(decisions, ["error"], "no signature for the checker, no payment to the seller");
  assert.equal(state.checks.length, 0);
  assert.equal(state.sellerPaid, 0);
});
