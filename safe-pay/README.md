# tolca-safe-pay

Stop your AI agent from paying the wrong x402 seller.

`tolca-safe-pay` is a drop-in for `wrapFetchWithPayment` from `@x402/fetch`. Before your agent pays a seller wallet for the first time, it asks [Tolca payment-check](https://tolca.tonbot.ca) about the exact payment request it is about to sign:

- is the `payTo` wallet on the US Treasury OFAC SDN list of crypto addresses?
- is the asset the official USDC contract of that network (13 networks), not a look-alike token?
- do the price and the wallet match the seller's live Coinbase x402 Bazaar listing (swapped wallet, inflated price)?

Then it acts on the answer:

| Tolca says | What happens |
|---|---|
| `allow` | the payment goes ahead |
| `review` | nothing is paid, unless your `onReview` callback says yes |
| `block` | nothing is paid, `SafePayError` is thrown |
| Tolca cannot be reached | nothing is paid (fail closed), unless you set `failOpen: true` |

## Install

```bash
npm i tolca-safe-pay @x402/fetch @x402/evm viem
```

## Use it with fetch

```js
import { x402Client } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm";
import { privateKeyToAccount } from "viem/accounts";
import { wrapFetchWithSafePay, SafePayError } from "tolca-safe-pay";

const account = privateKeyToAccount(process.env.PRIVATE_KEY);
const client = new x402Client().register("eip155:8453", new ExactEvmScheme(account));

// Before: const fetchWithPay = wrapFetchWithPayment(fetch, client);
const fetchWithPay = wrapFetchWithSafePay(fetch, client);

try {
  const res = await fetchWithPay("https://seller.example/api/data");
  console.log(await res.json());
} catch (err) {
  if (err instanceof SafePayError) {
    console.log("Not paid:", err.decision.reason); // err.decision.check has Tolca's full answer and signed receipt
  } else throw err;
}
```

## Use it with any x402Client (axios, your own wrapper)

`withSafePay` adds the check to the client itself, so every wrapper built on that client gets it:

```js
import { withSafePay, getSafePayDecision } from "tolca-safe-pay";
import { wrapAxiosWithPayment } from "@x402/axios";

const api = wrapAxiosWithPayment(axios.create(), withSafePay(client));
// On a stopped payment, getSafePayDecision(error) returns the decision.
```

## What it costs

- One check costs $0.01 in USDC on Base, paid with the same client to Tolca's wallet `0x35F0B86a7E33F561faf7cfa5654CAd9162C4A17d`.
- The library refuses to pay more than `maxCheckPriceUsd` (default $0.01) or any other wallet for the check. If that happens, nothing is paid at all.
- One check per seller wallet, network and asset, reused for 24 hours. It checks again if the price goes up or the asset changes.
- Your client needs Base (`eip155:8453`) registered to pay for the check, even if it pays sellers on other networks.

## Options

| Option | Default | What it does |
|---|---|---|
| `onReview(check, payment)` | never pays | Return `true` to pay on a `review` verdict |
| `onDecision(decision)` | none | Called for every decision: log it, keep the signed receipt |
| `cacheTtlMs` | 24 h | How long a verdict is reused. `0` checks every payment (strict mode) |
| `cache` | in-memory `Map` | Any `get`/`set` store (Redis, database) to share verdicts between processes |
| `trustedPayTo` | `[]` | Wallets paid without a check (your own services) |
| `failOpen` | `false` | Pay anyway when Tolca cannot be reached |
| `maxCheckPriceUsd` | `0.01` | Most you accept to pay for one check |
| `sellerInfo(payment)` | none | Return `{ name, country }` to also screen the seller company against US, UK, EU and Canadian sanctions lists |
| `timeoutMs` | `30000` | Timeout for the check |

Strict mode: Tolca's verdict covers the exact invoice it checked and is valid 10 minutes (`invoice_sha256`, `valid_until`). The 24 h cache trades that precision for cost. Set `cacheTtlMs: 0` when every payment must be checked.

## The decision object

```js
{
  allowed: false,
  verdict: "block",          // "allow" | "review" | "block" | null when no check ran
  source: "tolca",           // "tolca" | "cache" | "trusted" | "checker" | "error"
  reason: "block (risk 95), not paid: payTo is on the OFAC SDN list ...",
  check: { action, risk_score, reasons, valid_until, invoice_sha256, receipt, ... },
  network: "eip155:8453", payTo: "0x...", asset: "0x...", amount: "10000", resource: "https://...",
  at: "2026-11-07T20:00:00.000Z"
}
```

## Limits

Tolca's answer is dated evidence about one payment request, not a guarantee about the seller. A clean wallet can still sell a bad service. Read [what Tolca checks](https://github.com/yayabough/tolca#readme) and keep the signed receipt with your payment records.

## License

MIT
