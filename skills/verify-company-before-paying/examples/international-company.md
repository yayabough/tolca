# Example: a foreign supplier before a wire

**User:** Before we pay Huawei Technologies Co., Ltd. for equipment, run a vendor check.

**Agent calls** `sanctions-check` with `{"name": "Huawei Technologies Co., Ltd."}` ($0.005).

**Tolca answers (live check, Nov 1, 2026, abridged):**

- `action`: **block**
- `risk_score`: **95**
- Matches:
  - Entity List (EL), Bureau of Industry and Security (US), 2 entries
  - Non-SDN Chinese Military-Industrial Complex Companies List (CMIC), US Treasury
- Registries: UK and Canadian subsidiaries found and active (this does not change the block)

**Agent replies:** Do not pay. The company is an exact match on two US restricted-party lists. Keep the signed receipt with the decision and escalate to compliance.
