/**
 * Customer self-calls: store (or forget) YOUR OWN trading record.
 *
 *   npx tsx src/store.ts examples/record.json   store the record in the file
 *   npx tsx src/store.ts --forget               delete your record
 *
 * `store` and `forget` are self-only by design: the contract refuses them
 * on delegated calls, so an agent can never write or delete a record.
 * The record is validated locally first (same rules as the contract) so a
 * malformed record fails here with a readable message, not inside the enclave.
 */
import { readFile } from "node:fs/promises";
import { loadConfig } from "./config.js";
import { connectDeveloper } from "./client.js";
import { buildContractInput } from "./payload.js";
import { validateRecord, type TradingRecord } from "./risk.js";

async function main(): Promise<void> {
  const cfg = loadConfig();
  const { tenant, tenantDid } = await connectDeveloper(cfg);
  console.log(`Connected as ${tenantDid}`);

  if (process.argv.includes("--forget")) {
    const res = await tenant.contracts.execute(cfg.contractTail, {
      version: cfg.contractVersion,
      functionName: "forget",
      input: buildContractInput({}),
    });
    console.log("forget result:", JSON.stringify(res));
    return;
  }

  const file = process.argv[2];
  if (!file) throw new Error("Usage: npx tsx src/store.ts <record.json> | --forget");
  const record = JSON.parse(await readFile(file, "utf8")) as TradingRecord;
  const problems = validateRecord(record);
  if (problems.length > 0) {
    throw new Error(`Record failed local validation:\n- ${problems.join("\n- ")}`);
  }
  const res = await tenant.contracts.execute(cfg.contractTail, {
    version: cfg.contractVersion,
    functionName: "store",
    input: buildContractInput(record),
  });
  console.log("store result:", JSON.stringify(res));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
