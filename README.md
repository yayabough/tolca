# Tolca: know who you're paying before you pay

**Québec contractor check, company verification and web search for AI agents. Official registries, deterministic JSON, pay per call.**

Tolca answers three questions in one call each:

| Question | Tool / endpoint | What it checks |
|---|---|---|
| Is this Québec contractor safe to hire? | `qc_contractor_check` / `POST /v1/qc-contractor-check` | RBQ active licence (Régie du bâtiment), RENA (barred from public contracts, Autorité des marchés publics), environmental penalties (MELCCFP), SEAO public contracts awarded in the last 12 months |
| Does this contractor hold an active RBQ licence right now? | `qc_licence` / `POST /v1/qc-licence` | Fast yes/no with licence number and status |
| Is this company real and clean? | `business_verification` / `POST /v1/verify-business` | US sanctions (OFAC/CSL), Canadian federal corporations, UK Companies House, GLEIF |
| What does the web say, with sources? | `web_search` / `POST /v1/web-search` | 10 results plus the clean text of the top pages (title, text, sha256, fetch time). French/Canada by default, official-sources mode (.gc.ca, .gouv.qc.ca, .gov, CanLII) |

Answers are deterministic JSON (no LLM in the loop): a verdict `ok` / `review` / `blocking` / `not_found`, reasons, sources with extraction dates, and a `proof` block (sha256 of the answer). Registry data is refreshed daily from Données Québec (CC-BY 4.0) and the federal and international sources listed below.

- **Website (humans, pay by card):** https://tolca.tonbot.ca/verifier
- **Check a whole subcontractor list (up to 100, dated PDF report):** https://tolca.tonbot.ca/entreprises
- **Free public MCP server (read-only, daily quota, no account):** `https://tolca.tonbot.ca/mcp/public`
- **Paid MCP server (x402, USDC on Base, no account, no API key):** `https://tolca.tonbot.ca/mcp`
- **x402 REST endpoints:** `https://tolca.tonbot.ca/v1/...` (see prices below)
- **Official MCP Registry:** `io.github.yayabough/tolca`
- **Apify Store (card payment, bulk lists):** [Québec Contractor Check](https://apify.com/tolca/quebec-contractor-check), [Business Verification](https://apify.com/tolca/business-verification), [Web Search Reader](https://apify.com/tolca/web-search-reader)

## Use it in Claude, ChatGPT, Cursor or any MCP client

Server URL (streamable HTTP, stateless, no authentication):
```
https://tolca.tonbot.ca/mcp/public
```

Claude (web or desktop): Settings → Connectors → Add custom connector → paste the URL above.

Claude Code:
```bash
claude mcp add --transport http tolca https://tolca.tonbot.ca/mcp/public
```

Any MCP client that supports remote servers:
```json
{
  "mcpServers": {
    "tolca": { "type": "http", "url": "https://tolca.tonbot.ca/mcp/public" }
  }
}
```

Then ask: *"Is Construction ABC inc. licensed with the RBQ, listed in the RENA, and has it won public contracts recently?"*

### Free tools on `/mcp/public`

| Tool | What it does | Free limit |
|---|---|---|
| `qc_contractor_check` | RBQ licence + RENA + environmental penalties + SEAO public contracts, with a verdict | 10 per day |
| `qc_licence` | Does this business hold an active RBQ licence right now? | 50 per day |

Input: one of `neq` (10 digits), `licence` (RBQ licence number) or `name`, plus optional `lang` (`fr` or `en`).

Server card: https://tolca.tonbot.ca/.well-known/mcp/server-card.json

## Pay per call (x402, for agents)

No signup. Your agent gets a `402 Payment Required`, pays in USDC on Base, and gets the JSON back. Zero results = HTTP 404 = not charged.

| Endpoint | Price (USDC) |
|---|---|
| `POST /v1/web-search` | 0.008 |
| `POST /v1/qc-licence` | 0.01 |
| `POST /v1/verify-business` | 0.05 |
| `POST /v1/qc-contractor-check` | 0.10 |

Current prices and schemas: https://tolca.tonbot.ca/openapi.json and https://tolca.tonbot.ca/.well-known/x402

See [`examples/check.mjs`](examples/check.mjs):
```bash
npm i @x402/fetch @x402/evm viem
PRIVATE_KEY=0x... node examples/check.mjs "Construction ABC inc."
```

Without a payment, the endpoint answers `402 Payment Required` with the price in the `PAYMENT-REQUIRED` header:
```bash
curl -i -X POST https://tolca.tonbot.ca/v1/qc-contractor-check \
  -H "content-type: application/json" -d '{"name":"Neolect"}'
```

Web search example:
```bash
curl -i -X POST https://tolca.tonbot.ca/v1/web-search \
  -H "content-type: application/json" \
  -d '{"query":"subvention thermopompe Québec 2026","read":3,"freshness":"30d"}'
```

## Example response (contractor check, trimmed; values illustrative)

```json
{
  "verdict": "ok",
  "verdict_label": "OK",
  "reasons": [
    "Active RBQ licence, not listed in RENA, no environmental penalty found under this name.",
    "3 public contract(s) awarded on SEAO in the last 12 months (1.2 M$, e.g. Ville de Longueuil)"
  ],
  "rbq": {
    "licence": "8315-8105-31",
    "neq": "1166302126",
    "name": "Néolect inc.",
    "status": "Active",
    "bond_amount": "40000",
    "municipality": "Candiac",
    "subcategory_labels": ["1.2 Petits bâtiments", "16.0 Électricité"]
  },
  "rena": [],
  "environmental_penalties": [],
  "public_contracts": { "contracts": 3, "total_cad": 1200000, "buyers": ["Ville de Longueuil"], "window_months": 12 },
  "sources": [{ "id": "rbq", "extracted_at": "2026-10-17T05:00:00Z", "license": "CC-BY 4.0 (Québec)" }],
  "proof": { "generated_at": "2026-10-17T14:02:11Z", "sha256": "..." }
}
```

## Who it is for

- **General contractors bidding on public contracts:** a business listed in the RENA cannot obtain a public contract or a public subcontract. Check your whole subcontractor list before you bid.
- **Property and condo managers, insurers, quote platforms:** vet every supplier at signup and re-check them over time, keep a dated PDF in the file.
- **AI agents and developers** building procurement, compliance, home-renovation or research assistants: one call, cited answer, no account to manage.

## Limits

Public data as of the extraction date shown in each answer. Name matching can return homonyms: confirm with the NEQ or licence number. Not a substitute for checking directly with the RBQ or the AMP. Insurance and CNESST status are not covered. Web search reads public pages only; pages that block robots are reported in `pages_skipped`.

## Data attribution

Régie du bâtiment du Québec, Autorité des marchés publics, Ministère de l'Environnement, de la Lutte contre les changements climatiques, de la Faune et des Parcs, Système électronique d'appel d'offres (SEAO, OCDS). Données Québec, CC-BY 4.0. Corporations Canada, Companies House (UK), GLEIF, U.S. Consolidated Screening List. Web search powered by Brave Search.

---

### En français

Tolca vérifie un entrepreneur en construction du Québec en un seul appel: licence RBQ active, inscription au RENA (non admissible aux contrats et sous-contrats publics), sanctions environnementales et contrats publics octroyés au SEAO sur 12 mois. Verdict clair avec sources datées. Aussi: vérification d'entreprise (sanctions, registres fédéraux et internationaux) et recherche web qui lit les pages pour vous.

- Particuliers et entreprises, paiement par carte: https://tolca.tonbot.ca/verifier
- Vérifier toute une liste de sous-traitants (jusqu'à 100, rapport PDF daté): https://tolca.tonbot.ca/entreprises
- Serveur MCP public et gratuit, à ajouter dans Claude ou ChatGPT: `https://tolca.tonbot.ca/mcp/public`
- API x402 en USDC (Base), sans compte: de 0,008 $ (recherche web) à 0,10 $ (vérification complète) par appel

Contact: yasser@tonbot.ca
