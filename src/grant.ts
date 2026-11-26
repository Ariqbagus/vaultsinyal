/**
 * Grant the VaultSinyal agent the `check` function on the vault contract —
 * and nothing else. Run this as the CUSTOMER (data owner): in the
 * single-user flow that is the same developer key; for real users, each
 * user runs this with their own key and their own record.
 *
 *   AGENT_DID=did:t3n:... CONTRACT_NAME=z:<tid>:signal-vault npx tsx src/grant.ts
 *
 * Grants expire after 90 days by default; re-running renews (the SDK
 * read-merge-writes, so grants to other agents survive).
 */
import { loadConfig } from "./config.js";
import { connectDeveloper } from "./client.js";
import { grantCheck } from "./setup.js";

async function main(): Promise<void> {
  const cfg = loadConfig();
  const agentDid = process.env["AGENT_DID"] ?? cfg.agentDid;
  const contractName = process.env["CONTRACT_NAME"];
  if (!agentDid) throw new Error("Set AGENT_DID to the agent being granted.");
  if (!contractName) {
    throw new Error(
      "Set CONTRACT_NAME to the canonical contract name (z:<tid>:signal-vault) printed by setup --register.",
    );
  }
  const { t3n, tenantDid } = await connectDeveloper(cfg);
  await grantCheck(t3n, agentDid, contractName);
  console.log(`${tenantDid} granted agent ${agentDid} the check function on ${contractName} (90 days)`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
