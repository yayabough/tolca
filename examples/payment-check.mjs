// Check an x402 payment request with Tolca before paying the seller. Usage:
//   npm i @x402/fetch @x402/evm viem
//   PRIVATE_KEY=0x... node examples/payment-check.mjs https://seller.example/api/resource
import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm";
import { privateKeyToAccount } from "viem/accounts";

const sellerUrl = process.argv[2];
if (!sellerUrl) throw new Error("Give the seller URL as the first argument.");
const account = privateKeyToAccount(process.env.PRIVATE_KEY);
const client = new x402Client().register("eip155:8453", new ExactEvmScheme(account));
const paidFetch = wrapFetchWithPayment(fetch, client);

// 1. Ask the seller without paying: it answers 402 with its payment request.
const first = await fetch(sellerUrl);
if (first.status !== 402) {
  console.log("No payment required, HTTP", first.status);
  process.exit(0);
}
const header = first.headers.get("payment-required");
const paymentRequired = header ? JSON.parse(Buffer.from(header, "base64").toString("utf8")) : await first.json();

// 2. Ask Tolca before paying the seller ($0.01).
//    Shortcut: send { url: sellerUrl } instead and Tolca fetches the 402 itself (GET, then POST).
const res = await paidFetch("https://tolca.tonbot.ca/v1/payment-check", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ payment_required: paymentRequired }),
});
const check = await res.json();
console.log(`${check.action.toUpperCase()} (risk ${check.risk_score}), valid until ${check.valid_until}`);
for (const r of check.reasons ?? []) console.log(" -", r);

// 3. Pay the seller only when Tolca says allow.
if (check.action === "allow") {
  const paid = await paidFetch(sellerUrl);
  console.log("Seller answered HTTP", paid.status);
} else {
  console.log("Not paid. Keep the receipt with this decision.");
}
