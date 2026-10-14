// Québec contractor check over x402 (USDC on Base). Usage:
//   npm i @x402/fetch @x402/evm viem
//   PRIVATE_KEY=0x... node examples/check.mjs "Construction ABC inc."
import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm";
import { privateKeyToAccount } from "viem/accounts";

const query = process.argv[2] ?? "Neolect";
const account = privateKeyToAccount(process.env.PRIVATE_KEY);
const client = new x402Client().register("eip155:8453", new ExactEvmScheme(account));
const paidFetch = wrapFetchWithPayment(fetch, client);

const body = /^\d{10}$/.test(query) ? { neq: query } : { name: query };
const res = await paidFetch("https://tolca.tonbot.ca/v1/qc-contractor-check", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ ...body, lang: "en" }),
});

const out = await res.json();
console.log(`${out.verdict_label}: ${out.rbq?.name ?? query}`);
for (const r of out.reasons ?? []) console.log(" -", r);
