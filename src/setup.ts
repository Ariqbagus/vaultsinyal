/**
 * One-time (and re-runnable) platform setup for VaultSinyal.
 *
 * Nothing here is automatic on re-run: organisation and agent creation are
 * NOT idempotent on T3N (every call mints a new one), so both are guarded
 * by env vars, exactly like the official walkthrough. Each paid/irreversible
 * step is behind its own flag:
 *
 *   npx tsx src/setup.ts                  org + agent (guarded), balance, status
 *   npx tsx src/setup.ts --fund-agent 5   move 5 credits from YOUR balance to the agent
 *   npx tsx src/setup.ts --register       upload the contract WASM + create/update its map
 *   npx tsx src/setup.ts --grant          grant the agent the `check` function (and nothing else)
 *
 * The numeric contract_id returned by --register is persisted to
 * state/setup.json — T3N returns it only from register, there is no lookup.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fanOutGrant, formatTokens, toBaseUnits } from "@terminal3/t3n-sdk";
import type { BoundGrant, T3nClient, WireScope } from "@terminal3/t3n-sdk";
import { loadConfig } from "./config.js";
import { connectDeveloper } from "./client.js";

const STATE_PATH = path.resolve("state/setup.json");

interface SetupState {
  contractId?: number;
  contractName?: string;
  contractVersion?: string;
}

async function readState(): Promise<SetupState> {
  if (!existsSync(STATE_PATH)) return {};
  return JSON.parse(await readFile(STATE_PATH, "utf8")) as SetupState;
}

async function writeState(state: SetupState): Promise<void> {
  await mkdir(path.dirname(STATE_PATH), { recursive: true });
  await writeFile(STATE_PATH, JSON.stringify(state, null, 2));
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  const args = process.argv.slice(2);
  const { t3n, tenant, tenantDid } = await connectDeveloper(cfg);
  console.log(`Connected as tenant ${tenantDid} (${cfg.env})`);
  const balance = await t3n.getBalance();
  console.log(`Your balance: ${formatTokens(balance.available)} credits available`);

  // --- Organisation (guarded; creating one is not idempotent) ---
  let orgDid = cfg.orgDid;
  if (!orgDid) {
    const existing = (await t3n.myOrgs()).map((d) => d.value);
    if (existing.length > 0) {
      orgDid = existing[0];
      console.log(`Reusing existing organisation ${orgDid} — export ORG_DID="${orgDid}"`);
    } else {
      orgDid = (await t3n.createOrganisation("VaultSinyal")).value;
      console.log(`Created organisation ${orgDid} — run: export ORG_DID="${orgDid}"`);
    }
  }
  if (!orgDid) throw new Error("Organisation DID could not be determined.");

  // --- Agent (guarded; its apiKey is shown exactly once) ---
  let agentDid = cfg.agentDid;
  if (!agentDid) {
    const agent = await t3n.createAgent(orgDid, "VaultSinyal Checker");
    agentDid = agent.agentDid.value;
    console.log(`Created agent ${agentDid}`);
    console.log("SAVE THESE NOW — the agent apiKey is shown once and cannot be recovered:");
    console.log(`  export AGENT_DID="${agentDid}"`);
    console.log(`  export AGENT_API_KEY="${agent.apiKey}"`);
  }

  // --- Fund the agent from your own balance (opt-in flag) ---
  const fundIdx = args.indexOf("--fund-agent");
  if (fundIdx >= 0) {
    const credits = Number(args[fundIdx + 1] ?? "5");
    if (!Number.isFinite(credits) || credits <= 0) throw new Error("--fund-agent needs a positive credit amount");
    await t3n.fundAgent(agentDid, toBaseUnits(credits), { note: "VaultSinyal initial funding" });
    console.log(`Funded agent ${agentDid} with ${credits} credits from your balance`);
  }

  // --- Register the contract + create its map (opt-in flag) ---
  const state = await readState();
  if (args.includes("--register")) {
    const wasmBytes = await readFile(path.resolve(cfg.wasmPath));
    const result = await tenant.contracts.register({
      tail: cfg.contractTail,
      version: cfg.contractVersion,
      wasm: wasmBytes,
    });
    state.contractId = result.contract_id;
    state.contractName = result.name;
    state.contractVersion = cfg.contractVersion;
    await writeState(state);
    console.log(`Registered ${result.name} (contract_id ${result.contract_id})`);

    // The contract reads/writes z:<tid>:<tail>; the map must exist before
    // the first store, with readers set explicitly or the contract's own
    // reads fail with AccessDenied.
    try {
      await tenant.maps.create({
        tail: cfg.contractTail,
        visibility: "private",
        writers: { only: [result.contract_id] },
        readers: { only: [result.contract_id] },
      });
      console.log(`Created private map z:<tid>:${cfg.contractTail}`);
    } catch (err) {
      // Already exists (e.g. after a version bump): move its ACL to the new id.
      await tenant.maps.update(cfg.contractTail, {
        writers: { only: [result.contract_id] },
        readers: { only: [result.contract_id] },
      });
      console.log(`Updated existing map ACL to contract_id ${result.contract_id} (was: ${String(err).slice(0, 80)})`);
    }
  }

  // --- Grant the agent `check` and nothing else (opt-in flag) ---
  if (args.includes("--grant")) {
    if (state.contractId === undefined) {
      throw new Error("No contract_id in state/setup.json — run with --register first.");
    }
    await grantCheck(t3n, agentDid, state.contractName ?? cfg.contractTail);
    console.log(`Granted agent ${agentDid} the check function on ${state.contractName ?? cfg.contractTail}`);
  }

  console.log("Setup state:", JSON.stringify(state));
}

export async function grantCheck(t3n: T3nClient, agentDid: string, contractId: string): Promise<void> {
  // One function per grant row; fanOutGrant fans the intent out per function.
  // The vault contract needs no data scopes and no egress hosts: check only.
  const grants = fanOutGrant<BoundGrant>(
    { grantee: agentDid, contract_id: contractId, scopes: [] as WireScope[], allowed_hosts: [] },
    ["check"],
  );
  await t3n.updateMemberDelegation(grants);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
