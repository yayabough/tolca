# Tolca: Québec contractor check (MCP + x402)

**One call. Three official Québec public registries. A clear verdict.**

Tolca checks a Québec construction contractor against:

| Registry | Source | What it tells you |
|---|---|---|
| **RBQ active licences** | Régie du bâtiment du Québec | Licence status, restrictions, bond, authorized work categories |
| **RENA** | Autorité des marchés publics | Businesses barred from public contracts and public subcontracts |
| **Environmental penalties** | Québec Environment ministry (MELCCFP) | Administrative monetary penalties |

The answer is deterministic JSON (no LLM in the loop): `ok`, `review`, `blocking` or `not_found`, with reasons, sources and extraction dates. Data is refreshed daily from Données Québec (CC-BY 4.0).

- **Website (humans, pay by card):** https://tolca.tonbot.ca/verifier
- **Check a whole subcontractor list (up to 100, dated PDF report):** https://tolca.tonbot.ca/entreprises
- **Free public MCP server (read-only, no account, no payment):** `https://tolca.tonbot.ca/mcp/public`
- **x402 API (pay per call, $0.50 USDC on Base, no account, no API key):** `POST https://tolca.tonbot.ca/v1/qc-contractor-check`
- Official MCP Registry name: `ca.tonbot.tolca/tolca`

## Use it in Claude, ChatGPT or any MCP client

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

Then ask: *"Is Construction ABC inc. licensed with the RBQ, and is it listed in the RENA?"*

### Tools (all read-only, free)

| Tool | What it does | Free limit |
|---|---|---|
| `qc_contractor_check` | RBQ licence + RENA + environmental penalties, with a verdict `ok` / `review` / `blocking` / `not_found` | 10 per day |
| `qc_licence` | Fast check: does this business hold an active RBQ licence right now? | 50 per day |

Input for the Québec tools: one of `neq` (10 digits), `licence` (RBQ licence number) or `name`, plus optional `lang` (`fr` or `en`).

Server card: https://tolca.tonbot.ca/.well-known/mcp/server-card.json

## Pay per call from code (x402, for agents)

Separate from the free MCP server above. No signup. Your agent pays $0.50 USDC on Base per check and gets the JSON back.

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

## Example response (trimmed)

```json
{
  "verdict": "ok",
  "verdict_label": "OK",
  "reasons": ["Active RBQ licence, not listed in RENA, no environmental penalty found under this name."],
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
  "sources": [{ "id": "rbq", "extracted_at": "2026-10-14T05:00:00Z", "license": "CC-BY 4.0 (Québec)" }]
}
```

## Who it is for

- **General contractors bidding on public contracts:** a business listed in the RENA cannot obtain a public contract or a public subcontract. Check your whole subcontractor list before you bid.
- **Property and condo managers:** vet every supplier, keep a dated PDF in the file.
- **Quote and renovation platforms:** verify contractors at signup and re-check them over time.
- **AI agents and developers** building procurement, compliance or home-renovation assistants.

## Limits

Public data as of the extraction date shown in each answer. Name matching can return homonyms: confirm with the NEQ or licence number. Not a substitute for checking directly with the RBQ or the AMP. Insurance and CNESST status are not covered.

## Data attribution

Régie du bâtiment du Québec, Autorité des marchés publics, Ministère de l'Environnement, de la Lutte contre les changements climatiques, de la Faune et des Parcs. Données Québec, CC-BY 4.0.

---

### En français

Tolca vérifie un entrepreneur en construction du Québec en un seul appel: licence RBQ active, inscription au RENA (non admissible aux contrats et sous-contrats publics) et sanctions environnementales. Verdict clair avec sources datées.

- Particuliers et entreprises, paiement par carte: https://tolca.tonbot.ca/verifier
- Vérifier toute une liste de sous-traitants (jusqu'à 100, rapport PDF daté): https://tolca.tonbot.ca/entreprises
- Serveur MCP public et gratuit, à ajouter dans Claude ou ChatGPT: `https://tolca.tonbot.ca/mcp/public`
- API x402 à 0,50 $ US en USDC (Base), sans compte

Contact: yasser@tonbot.ca
