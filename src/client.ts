/**
 * Developer session bootstrap — the official Quickstart flow, unchanged:
 * setEnvironment -> loadWasmComponent -> T3nClient (attested trust anchor +
 * EthSign handler derived from the developer key) -> handshake ->
 * authenticate. The tenant DID is always read back from the session, never
 * derived or hardcoded.
 */
import {
  T3nClient,
  TenantClient,
  createEthAuthInput,
  eth_get_address,
  getNodeUrl,
  loadWasmComponent,
  metamask_sign,
  resolveTrustAnchor,
  setEnvironment,
} from "@terminal3/t3n-sdk";
import type { VaultSinyalConfig } from "./config.js";

export interface DeveloperSession {
  t3n: T3nClient;
  tenant: TenantClient;
  tenantDid: string;
}

export async function connectDeveloper(cfg: VaultSinyalConfig): Promise<DeveloperSession> {
  setEnvironment(cfg.env);
  const wasmComponent = await loadWasmComponent();
  const address = eth_get_address(cfg.apiKey);
  const t3n = new T3nClient({
    trustAnchor: await resolveTrustAnchor(cfg.env),
    wasmComponent,
    handlers: { EthSign: metamask_sign(address, undefined, cfg.apiKey) },
  });
  await t3n.handshake();
  const did = await t3n.authenticate(createEthAuthInput(address));
  const tenantDid = did.value;
  const tenant = new TenantClient({
    t3n,
    tenantDid,
    environment: cfg.env,
    baseUrl: getNodeUrl(),
  });
  return { t3n, tenant, tenantDid };
}
