/**
 * The VaultSinyal agent runner — the part that runs on a schedule.
 *
 * For one customer DID it:
 *   1. fetches PUBLIC prices for the watched assets (Binance public API —
 *      public data only; prices are an input to the yes/no questions, they
 *      are not private and never come from the vault),
 *   2. asks the enclave to evaluate the risk rules via `invoke()` with the
 *      AGENT's API key, naming the customer in `pii_did` (a delegated call —
 *      it only works because the customer granted this agent `check`),
 *   3. appends the outcome to data/checks.jsonl — the local traction log
 *      behind the dashboard (checks run, unique customer DIDs).
 *
 * The agent never sees the stored record: the contract answers booleans.
 *
 *   npx tsx src/agent.ts [rules.json]     (default: examples/rules.json)
 * Env: AGENT_API_KEY, CUSTOMER_DID, CONTRACT_NAME (or CONTRACT_TAIL +
 * CUSTOMER_DID to derive it), CONTRACT_VERSION, T3N_ENV.
 */
import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { getNodeUrl, invoke, setEnvironment } from "@terminal3/t3n-sdk";
import { agentApiKey, loadAgentConfig } from "./config.js";
import { buildContractInput, parseCheckResponse } from "./payload.js";
import type { RiskRules } from "./risk.js";

const LOG_PATH = path.resolve("data/checks.jsonl");

export interface PriceQuote {
  symbol: string;
  priceCents: number;
}

/** Public quotes from Binance's public data host (no key, no account). */
export async function fetchPrices(symbols: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const symbol of symbols) {
    const url = `https://data-api.binance.vision/api/v3/ticker/price?symbol=${encodeURIComponent(symbol)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Price fetch failed for ${symbol}: HTTP ${res.status}`);
    const body = (await res.json()) as { symbol: string; price: string };
    out[symbol] = Math.round(Number(body.price) * 100);
  }
  return out;
}

async function main(): Promise<void> {
  const cfg = loadAgentConfig();
  setEnvironment(cfg.env);
  const customerDid = process.env["CUSTOMER_DID"] ?? cfg.customerDid;
  if (!customerDid) throw new Error("Set CUSTOMER_DID to the data owner the agent acts for.");
  const contractName = process.env["CONTRACT_NAME"];
  if (!contractName) {
    throw new Error("Set CONTRACT_NAME to the canonical contract name (z:<tid>:signal-vault) from setup --register.");
  }

  const rulesFile = process.argv[2] ?? "examples/rules.json";
  const rules = JSON.parse(await readFile(rulesFile, "utf8")) as RiskRules & { watch?: string[] };
  const watch = rules.watch ?? Object.keys(rules.prices ?? {});
  const livePrices = watch.length > 0 ? await fetchPrices(watch) : {};
  const checkRules: RiskRules = { ...rules, prices: { ...(rules.prices ?? {}), ...livePrices } };
  delete (checkRules as { watch?: string[] }).watch;

  const startedAt = new Date().toISOString();
  const response = await invoke({
    baseUrl: getNodeUrl(),
    apiKey: agentApiKey(),
    request: {
      contract_id: contractName,
      contract_version: cfg.contractVersion,
      function_name: "check",
      pii_did: customerDid,
      input: buildContractInput({ rules: checkRules }),
    },
  });
  const { answers, custom } = parseCheckResponse(response);
  const allPassed = Object.values(answers).every(Boolean);

  await mkdir(path.dirname(LOG_PATH), { recursive: true });
  await appendFile(
    LOG_PATH,
    JSON.stringify({
      ts: startedAt,
      customer_did: customerDid,
      contract: contractName,
      answers,
      all_passed: allPassed,
      custom: custom ?? {},
    }) + "\n",
  );
  console.log(JSON.stringify({ customer: customerDid, answers, all_passed: allPassed }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
