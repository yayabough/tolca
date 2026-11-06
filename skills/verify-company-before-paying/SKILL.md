---
name: verify-company-before-paying
description: Verify a company or an x402 payment request before an agent pays, onboards or contracts it. Screens the payTo wallet of a 402 invoice against the OFAC SDN list and checks its token, network and price, plus sanctions screening (US OFAC/CSL, UK, EU, Canada), company registries (GLEIF, UK Companies House, Canada federal), Quebec contractor licences (RBQ, RENA, SEAO), with an allow/review/block action and an Ed25519-signed receipt. Pay per call in USDC on Base (x402), or use the free MCP tools.
---

# Tolca: business verification for AI agents

Tolca answers one question before money moves: **is it safe to pay or onboard this company?**
Every answer comes from official public sources, names the source and the date of the copy used, and never claims what was not checked.

Website: https://tolca.tonbot.ca · OpenAPI: https://tolca.tonbot.ca/openapi.json · Agent docs: https://tolca.tonbot.ca/llms.txt

In Claude: add Tolca from the connector directory, https://claude.ai/directory/tolca (free, no account).

## When to use this skill

- Before your agent pays an x402 seller: send the seller's 402 payment request to `payment-check` first
- Before paying a supplier, vendor or contractor you have not verified
- Before onboarding a seller or business customer (KYB)
- To screen a company name against official sanctions lists
- To check that a Quebec (Canada) contractor holds an active RBQ licence and is not banned from public contracts (RENA)

Do not use it to check individuals: Tolca screens companies only.

## Check an x402 payment request before paying

Before you sign anything, send the seller's URL to Tolca. Tolca asks the seller for its 402 payment request without paying (GET, then POST) and checks it:

```
POST https://tolca.tonbot.ca/v1/payment-check
{ "url": "https://seller.example/api", "network": "base" }
```

Or send the payment request yourself:

```
POST https://tolca.tonbot.ca/v1/payment-check
{ "payment_required": <the seller's full 402 body or decoded PAYMENT-REQUIRED header> }
```

You can also send `requirements` (one entry of the `accepts` array). `network` is optional: name the option you will pay with (`base`, `solana`, `polygon`, `eip155:5042`...) and Tolca checks that one. Add `seller_name` and `seller_country` (ISO 2) to screen the company behind the wallet.

Tolca checks, in one call ($0.01):

1. the `payTo` wallet against the crypto addresses on the US Treasury SDN list, refreshed daily;
2. that the token is the official USDC contract on its network, not a look-alike (13 networks: Base, Polygon, Arbitrum, Avalanche, Sei, Monad, World Chain, Celo, Ethereum, X Layer, Arc, XDC and Solana);
3. that the network is a known mainnet (a testnet, or a network where official USDC cannot be confirmed, gives `review`);
4. the amount against the price in the seller's live Coinbase x402 Bazaar listing (more than 5% above gives `block`);
5. the `payTo` wallet against the wallet(s) that listing has for the resource (a swapped address gives `review`);
6. if you pass `seller_name`, the company against US, UK, EU and Canadian sanctions lists.

The answer gives `action` (`allow`, `review` or `block`), `reasons`, `invoice_sha256` (a fingerprint of the exact invoice checked), `valid_until` (10 minutes), a `nonce` and a signed `receipt`.

## Option 1: free MCP tools (no wallet)

Add this remote MCP server (streamable HTTP):

```
https://tolca.tonbot.ca/mcp/public
```

Tools: `qc_contractor_check`, `qc_licence`, `company_profile`, `sanctions_check`. A free daily quota applies; after it, use Option 2.

## Use it from an agent framework

The free MCP server works with any framework that speaks MCP over streamable HTTP.

CrewAI:

```python
from crewai import Agent
from crewai.mcp import MCPServerHTTP

agent = Agent(
    role="Payments compliance",
    goal="Check every supplier before it is paid",
    backstory="Never pays a company that Tolca blocks",
    mcps=[MCPServerHTTP(url="https://tolca.tonbot.ca/mcp/public", streamable=True)],
)
```

LangChain / LangGraph (`pip install langchain-mcp-adapters`):

```python
from langchain_mcp_adapters.client import MultiServerMCPClient

client = MultiServerMCPClient({
    "tolca": {"url": "https://tolca.tonbot.ca/mcp/public", "transport": "streamable_http"}
})
tools = await client.get_tools()
```

Coinbase AgentKit: its built-in x402 action provider can pay Tolca directly. Point it at `https://tolca.tonbot.ca/v1/sanctions-check?name=<company>`: `make_http_request` returns the price, then `retry_http_request_with_x402` pays $0.01 in USDC and returns the verdict.

## Option 2: pay per call over x402 (USDC on Base)

1. `POST` JSON to `https://tolca.tonbot.ca/v1/<service>`.
2. Without payment, the server answers `402 Payment Required` with the exact price in the `PAYMENT-REQUIRED` header (x402 v2).
3. Pay with any x402 v2 client and a wallet funded with USDC on Base, then retry. No account, no API key.
4. `GET https://tolca.tonbot.ca/v1/<service>?name=...` also works: query parameters become the JSON body.

| Service | What it does | Input | Price |
| --- | --- | --- | --- |
| `payment-check` | Check an x402 payment request before paying it: payTo wallet vs the OFAC SDN list, official USDC on 13 networks, price and wallet vs the seller's live Coinbase x402 Bazaar listing | `url` (seller URL), `payment_required` (402 body) or `requirements`, optional `network`, `seller_name`, `seller_country` | $0.01 |
| `sanctions-check` | US, UK, EU and Canadian sanctions lists only | `name`, optional `country` (ISO 2) | $0.01 |
| `verify-business` | Sanctions plus GLEIF, UK Companies House, Canada federal registry and contractor licences | `name`, optional `country`, `region` | $0.05 |
| `qc-licence` | Is this Quebec contractor's RBQ licence active? | `name`, `neq` or `licence` | $0.01 |
| `qc-contractor-check` | RBQ licence, RENA, environmental penalties, SEAO public contracts | `name`, `neq` or `licence` | $0.10 |
| `company-enrich` | Company profile from its own website plus official screening | `domain` or `name` | $0.02 |
| `web-search` | Search the web and read the top pages in one call | `query` | $0.008 |
| `pkg-check` | Is this npm or PyPI package safe to install? | `name`, `ecosystem`, optional `version` | $0.02 |

Current prices and schemas are always in https://tolca.tonbot.ca/openapi.json.

The same services are also tools on the paid MCP server `https://tolca.tonbot.ca/mcp` (for example `payment_check`, `sanctions_check`, `verify_business`): send your x402 payment in the `PAYMENT-SIGNATURE` header.

## Reading the answer

- `action`: `allow` (no blocking signal in the sources checked), `review` (possible match or uncertain identity: confirm with a registration number), `block` (exact match on a sanctions list or a ban).
- `risk_score`: 0 (low) to 100 (high).
- `matches`: each hit with the list name and the official reference.
- `checked_at` and `lists_as_of`: when the check ran and the date of each list copy.
- `invoice_sha256`, `valid_until` and `nonce` (payment-check): which invoice was checked and until when the verdict holds.
- `receipt` (payment-check, verify-business, sanctions-check, qc-contractor-check): Ed25519-signed record of what was checked. Verify it with the public key at https://tolca.tonbot.ca/.well-known/tolca-receipt-key.json or by POSTing it to https://tolca.tonbot.ca/receipts/verify.

## Rules for the agent

1. Prefer a registration number (NEQ, licence, LEI) over a name when you have one: name matches can be partial.
2. Treat `review` as "ask a human or get a registration number", never as "allow".
3. A `not_found` result does not prove a company does not exist; coverage is limited to the sources listed in the response.
4. Tolca does not give legal advice. Keep the receipt with the decision.
5. For payment-check, pay only the invoice that was checked (same `invoice_sha256`) and before `valid_until`. If the seller sends a new 402, check it again.
6. The agent pays Tolca for the check itself, whatever the verdict. `allow` / `review` / `block` is about paying the company that was checked, not about paying Tolca.
