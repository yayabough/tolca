# Verify a Company Before Paying It

Give your agent a reliable way to check a business before it pays, hires or signs with it.

Powered by Tolca (https://tolca.tonbot.ca). Every answer comes from official public sources, names each source with the date of the copy used, and never claims what was not checked.

## What it checks

- **x402 payment requests**: the payTo wallet against the crypto addresses on the US Treasury SDN list, official USDC on Base, the expected network, and the price and wallet compared with the x402 Bazaar catalogue.
- **Sanctions** in 4 jurisdictions: US Consolidated Screening List (incl. OFAC SDN and the Entity List), UK Sanctions List (FCDO), EU Consolidated Financial Sanctions List, Canada's Consolidated Autonomous Sanctions List. UN designations are covered as implemented by the UK and the EU.
- **Company registries**: UK Companies House, Canada federal corporations, GLEIF legal entities.
- **Québec contractors**: RBQ licence and subcategories, RENA (public-contract ban), environmental penalties, SEAO public contracts.

## What you get

- `action`: allow / review / block
- `risk_score`: 0 to 100
- Each match with its list and official reference, and the date of each list copy
- An Ed25519-signed receipt (payment-check, sanctions-check, verify-business, qc-contractor-check), verifiable by anyone

## How to use it

- **Free**: add the MCP server `https://tolca.tonbot.ca/mcp/public`, or add Tolca in Claude from https://claude.ai/directory/tolca
- **Pay per call** over x402 in USDC on Base: $0.01 for payment-check and sanctions-check, $0.05 for verify-business
- Works with CrewAI, LangChain / LangGraph and Coinbase AgentKit (see SKILL.md)

Companies only. Not legal advice.
