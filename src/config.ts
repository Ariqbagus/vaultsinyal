/**
 * Environment configuration. Every secret comes from the environment —
 * nothing is hardcoded and nothing is read from a committed file.
 *
 * The developer key is read from `T3_API_KEY` first (this project's
 * convention) and falls back to `T3N_API_KEY` (the name the official
 * Terminal 3 docs use), so either export works.
 */
export interface VaultSinyalConfig {
  apiKey: string;
  env: "testnet" | "production";
  orgDid?: string;
  agentDid?: string;
  agentApiKey?: string;
  customerDid?: string;
  contractTail: string;
  contractVersion: string;
  wasmPath: string;
}

function optional(name: string): string | undefined {
  const v = process.env[name];
  return v !== undefined && v.trim() !== "" ? v.trim() : undefined;
}

export function developerApiKey(): string {
  const key = optional("T3_API_KEY") ?? optional("T3N_API_KEY");
  if (!key) {
    throw new Error(
      "Missing developer API key: export T3_API_KEY (see CLAIM.md for how to claim one).",
    );
  }
  return key;
}

export function agentApiKey(): string {
  const key = optional("AGENT_API_KEY");
  if (!key) {
    throw new Error(
      "Missing AGENT_API_KEY: create the agent first (npm run setup) and store the key it prints — it is shown only once.",
    );
  }
  return key;
}

/** Config for the agent runner: it holds ONLY the agent's key, never the
 *  developer key, so it must not require T3_API_KEY. */
export function loadAgentConfig(): Pick<VaultSinyalConfig, "env" | "contractTail" | "contractVersion" | "customerDid"> {
  const envRaw = optional("T3N_ENV") ?? "testnet";
  if (envRaw !== "testnet" && envRaw !== "production") {
    throw new Error(`T3N_ENV must be "testnet" or "production", got "${envRaw}".`);
  }
  return {
    env: envRaw,
    contractTail: optional("CONTRACT_TAIL") ?? "signal-vault",
    contractVersion: optional("CONTRACT_VERSION") ?? "0.1.0",
    customerDid: optional("CUSTOMER_DID"),
  };
}

export function loadConfig(): VaultSinyalConfig {
  const envRaw = optional("T3N_ENV") ?? "testnet";
  if (envRaw !== "testnet" && envRaw !== "production") {
    throw new Error(`T3N_ENV must be "testnet" or "production", got "${envRaw}".`);
  }
  return {
    apiKey: developerApiKey(),
    env: envRaw,
    orgDid: optional("ORG_DID"),
    agentDid: optional("AGENT_DID"),
    agentApiKey: optional("AGENT_API_KEY"),
    customerDid: optional("CUSTOMER_DID"),
    contractTail: optional("CONTRACT_TAIL") ?? "signal-vault",
    contractVersion: optional("CONTRACT_VERSION") ?? "0.1.0",
    wasmPath:
      optional("WASM_PATH") ??
      "../contract/target/wasm32-wasip2/release/signal_vault.wasm",
  };
}
