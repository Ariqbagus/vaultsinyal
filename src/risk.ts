/**
 * Pure risk-rule evaluation — a TypeScript REFERENCE implementation of the
 * exact semantics implemented in Rust inside the TEE contract
 * (contract/src/logic.rs). The contract is the source of truth on-chain;
 * this mirror exists so the agent can log an expected outcome next to the
 * enclave's yes/no answers, and so the rule math is unit-testable without
 * an API key. If the two ever disagree, the contract wins and the drift
 * must be fixed here.
 *
 * All money values are integer cents. All percentages are basis points
 * (bps): 200 bps = 2%.
 */

export interface Position {
  asset: string;
  side: "long" | "short";
  entry_price_cents: number;
  size_cents: number; // notional
  stop_loss_price_cents?: number | null;
  opened_on: string; // YYYY-MM-DD
}

export interface RiskPolicy {
  max_risk_per_position_bps: number;
  max_total_open_risk_bps: number;
  max_positions: number;
  account_equity_cents: number;
  require_stop_loss: boolean;
}

export interface TradingRecord {
  positions: Position[];
  risk_policy: RiskPolicy;
}

export interface RiskRules {
  risk_per_position_within_limit?: boolean;
  total_open_risk_within_limit?: boolean;
  position_count_within_limit?: boolean;
  all_positions_have_stop_loss?: boolean;
  no_stop_loss_breached?: boolean;
  /** asset symbol -> current price in cents (public market data) */
  prices?: Record<string, number>;
}

export type RuleAnswers = Record<string, boolean>;

/** Risk of one position in cents: |entry - stop| / entry * notional.
 *  Without a stop, the whole notional is at risk. */
export function positionRiskCents(p: Position): number {
  if (p.stop_loss_price_cents === undefined || p.stop_loss_price_cents === null) {
    return p.size_cents;
  }
  const distance = Math.abs(p.entry_price_cents - p.stop_loss_price_cents);
  return Math.floor((distance * p.size_cents) / p.entry_price_cents);
}

export function riskBps(riskCents: number, equityCents: number): number {
  if (equityCents <= 0) return Number.POSITIVE_INFINITY;
  return Math.floor((riskCents * 10_000) / equityCents);
}

export function evaluateRisk(record: TradingRecord, rules: RiskRules): RuleAnswers {
  const out: RuleAnswers = {};
  const policy = record.risk_policy;

  if (rules.risk_per_position_within_limit) {
    out["risk_per_position_within_limit"] = record.positions.every(
      (p) => riskBps(positionRiskCents(p), policy.account_equity_cents) <= policy.max_risk_per_position_bps,
    );
  }
  if (rules.total_open_risk_within_limit) {
    const total = record.positions.reduce((sum, p) => sum + positionRiskCents(p), 0);
    out["total_open_risk_within_limit"] =
      riskBps(total, policy.account_equity_cents) <= policy.max_total_open_risk_bps;
  }
  if (rules.position_count_within_limit) {
    out["position_count_within_limit"] = record.positions.length <= policy.max_positions;
  }
  if (rules.all_positions_have_stop_loss) {
    out["all_positions_have_stop_loss"] = record.positions.every(
      (p) => p.stop_loss_price_cents !== undefined && p.stop_loss_price_cents !== null,
    );
  }
  if (rules.no_stop_loss_breached) {
    const prices = rules.prices ?? {};
    out["no_stop_loss_breached"] = record.positions.every((p) => {
      if (p.stop_loss_price_cents === undefined || p.stop_loss_price_cents === null) return true;
      const price = prices[p.asset];
      if (price === undefined) return true; // no public quote -> not breached
      return p.side === "long" ? price > p.stop_loss_price_cents : price < p.stop_loss_price_cents;
    });
  }
  return out;
}

export function validateRecord(record: TradingRecord): string[] {
  const problems: string[] = [];
  if (!Number.isInteger(record.risk_policy.account_equity_cents) || record.risk_policy.account_equity_cents <= 0) {
    problems.push("risk_policy.account_equity_cents must be a positive integer (cents)");
  }
  for (const [i, p] of record.positions.entries()) {
    if (p.asset.trim() === "") problems.push(`positions[${i}].asset must not be empty`);
    if (p.side !== "long" && p.side !== "short") problems.push(`positions[${i}].side must be "long" or "short"`);
    if (!Number.isInteger(p.entry_price_cents) || p.entry_price_cents <= 0)
      problems.push(`positions[${i}].entry_price_cents must be a positive integer (cents)`);
    if (!Number.isInteger(p.size_cents) || p.size_cents <= 0)
      problems.push(`positions[${i}].size_cents must be a positive integer (cents)`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.opened_on)) problems.push(`positions[${i}].opened_on must be YYYY-MM-DD`);
  }
  return problems;
}
