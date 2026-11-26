# VaultSinyal

A private trading-signal vault on the **Terminal 3 Developer Platform
(T3N)**, built for the Terminal 3 Build+Scale Agent Micro Grant.

A trader seals their sensitive trading record — positions, entry prices,
sizes, and their personal risk policy — into a TEE contract on T3N. A
scheduled agent is granted exactly **one** contract function, `check`, and
can only ask yes/no risk questions about the record ("is any position's
risk above 2% of equity?", "has any stop-loss been breached by the current
public price?"). The agent never sees a position, a price level, or a
balance. Every check is a metered on-platform call billed to the agent,
and the built-in dashboard turns those calls into adoption evidence:
checks run, unique customer DIDs, failed-rule counts.

Built on `@terminal3/t3n-sdk` (5.42.0 at time of writing — the SDK ships
breaking changes in minor versions, so it is installed unpinned, exactly
as the official docs prescribe) plus a Rust -> WASM TEE contract in
`contract/` that follows the official `agent-vault-starter` pattern.

See **ARCHITECTURE.md** for the SDK research notes and system design, and
**CLAIM.md** for how the account owner claims the API key this needs.

## Layout

| Path | What |
|---|---|
| `src/client.ts` | Developer session bootstrap (official Quickstart flow) |
| `src/setup.ts` | Org + agent (guarded), funding, contract registration, grant |
| `src/store.ts` | Customer self-call: store / forget your own trading record |
| `src/grant.ts` | Customer grants the agent `check` — and nothing else |
| `src/agent.ts` | Scheduled agent: public prices -> `invoke(check)` -> log |
| `src/dashboard.ts` | Traction evidence: `dashboard.json` + `dashboard.html` |
| `src/risk.ts` | TS reference implementation of the contract's rule math |
| `contract/` | The TEE contract (Rust -> `wasm32-wasip2` component) |
| `examples/` | A fictional trading record + the standard rule set |
| `scripts/run-agent.sh` | Cron wrapper for one agent cycle + dashboard |

## Run it

Prerequisite: an API key (see CLAIM.md). Secrets live only in the
environment — `T3_API_KEY` (the official docs' name `T3N_API_KEY` is also
accepted), `AGENT_API_KEY`, and the DIDs printed during setup. Nothing is
hardcoded; `.env` is git-ignored.

```bash
npm install
cp .env.example .env        # fill in T3_API_KEY

npx tsx src/setup.ts                    # connect, org, agent; prints exports to save
npx tsx src/setup.ts --fund-agent 5     # fund the agent from your balance

# Build the contract (needs a Rust toolchain + vendored WIT deps —
# see contract/README.md and contract/wit/deps/README.md)
(cd contract && cargo test && cargo build --target wasm32-wasip2 --release)

npx tsx src/setup.ts --register         # upload WASM, create the private map
npx tsx src/setup.ts --grant            # grant the agent `check` only
npx tsx src/store.ts examples/record.json
./scripts/run-agent.sh                  # one agent check cycle + dashboard
```

## Local verification (no key needed)

```bash
npm run typecheck   # tsc --noEmit — clean
npm test            # node:test via tsx — rule math, payloads, config, dashboard
```

## Still to verify on the first live run (needs the key)

1. The `generic-input` payload encoding in `src/payload.ts` (single place
   to adjust if the node expects a different wire shape).
2. `TenantClient` construction from the session in `src/client.ts`.
3. The grant's `contract_id` form (canonical `z:<tid>:signal-vault` name
   from `register`'s result, as the SDK types specify).
4. End-to-end: store -> grant -> agent check -> 403 on an ungranted
   function -> activity-log labels -> credit metering.
