import { test } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateRisk,
  positionRiskCents,
  validateRecord,
  type TradingRecord,
} from "../src/risk.js";
import { buildContractInput, parseCheckResponse } from "../src/payload.js";
import { summarize, type CheckLogEntry } from "../src/dashboard.js";

const record: TradingRecord = {
  positions: [
    {
      asset: "BTCUSDT",
      side: "long",
      entry_price_cents: 9_000_000,
      size_cents: 500_000,
      stop_loss_price_cents: 8_550_000, // 5% below entry -> risk = 25_000 cents = 0.5% of equity
      opened_on: "2026-11-20",
    },
    {
      asset: "ETHUSDT",
      side: "long",
      entry_price_cents: 310_000,
      size_cents: 300_000,
      stop_loss_price_cents: null, // no stop -> full notional at risk
      opened_on: "2026-11-22",
    },
  ],
  risk_policy: {
    max_risk_per_position_bps: 200,
    max_total_open_risk_bps: 500,
    max_positions: 5,
    account_equity_cents: 5_000_000,
    require_stop_loss: true,
  },
};

test("positionRiskCents: stop distance share of notional", () => {
  assert.equal(positionRiskCents(record.positions[0]!), 25_000);
  assert.equal(positionRiskCents(record.positions[1]!), 300_000);
});

test("evaluateRisk: per-position limit fails only because of the stop-less position", () => {
  const answers = evaluateRisk(record, { risk_per_position_within_limit: true });
  assert.deepEqual(answers, { risk_per_position_within_limit: false });
  const onlyBtc: TradingRecord = { ...record, positions: [record.positions[0]!] };
  assert.deepEqual(evaluateRisk(onlyBtc, { risk_per_position_within_limit: true }), {
    risk_per_position_within_limit: true,
  });
});

test("evaluateRisk: total open risk, count, stop presence", () => {
  const answers = evaluateRisk(record, {
    total_open_risk_within_limit: true,
    position_count_within_limit: true,
    all_positions_have_stop_loss: true,
  });
  // total risk = 325_000 / 5_000_000 = 650 bps > 500 bps limit
  assert.equal(answers["total_open_risk_within_limit"], false);
  assert.equal(answers["position_count_within_limit"], true);
  assert.equal(answers["all_positions_have_stop_loss"], false);
});

test("evaluateRisk: stop breach uses public prices, long and short", () => {
  const withStop: TradingRecord = { ...record, positions: [record.positions[0]!] };
  assert.equal(
    evaluateRisk(withStop, { no_stop_loss_breached: true, prices: { BTCUSDT: 8_600_000 } })[
      "no_stop_loss_breached"
    ],
    true,
  );
  assert.equal(
    evaluateRisk(withStop, { no_stop_loss_breached: true, prices: { BTCUSDT: 8_500_000 } })[
      "no_stop_loss_breached"
    ],
    false,
  );
  const short: TradingRecord = {
    ...record,
    positions: [{ ...record.positions[0]!, side: "short", stop_loss_price_cents: 9_450_000 }],
  };
  assert.equal(
    evaluateRisk(short, { no_stop_loss_breached: true, prices: { BTCUSDT: 9_500_000 } })[
      "no_stop_loss_breached"
    ],
    false,
  );
});

test("validateRecord catches bad shapes", () => {
  assert.deepEqual(validateRecord(record), []);
  const bad: TradingRecord = {
    ...record,
    positions: [{ ...record.positions[0]!, entry_price_cents: 0, opened_on: "20-11-2026" }],
  };
  const problems = validateRecord(bad);
  assert.equal(problems.length, 2);
});

test("payload: build + parse round trip", () => {
  const input = buildContractInput({ rules: { risk_per_position_within_limit: true } });
  assert.deepEqual(input, { rules: { risk_per_position_within_limit: true } });
  const parsed = parseCheckResponse(
    JSON.stringify({ answers: { risk_per_position_within_limit: true }, custom: { vault_op: "check" } }),
  );
  assert.deepEqual(parsed.answers, { risk_per_position_within_limit: true });
  assert.throws(() => parseCheckResponse({ nope: 1 }));
});

test("dashboard summarize counts checks, DIDs and breaches", () => {
  const entries: CheckLogEntry[] = [
    { ts: "2026-11-26T00:00:00Z", customer_did: "did:t3n:a", contract: "z:x:signal-vault", answers: {}, all_passed: true },
    { ts: "2026-11-26T01:00:00Z", customer_did: "did:t3n:a", contract: "z:x:signal-vault", answers: {}, all_passed: false },
    { ts: "2026-11-26T02:00:00Z", customer_did: "did:t3n:b", contract: "z:x:signal-vault", answers: {}, all_passed: true },
  ];
  const d = summarize(entries);
  assert.equal(d.total_checks, 3);
  assert.equal(d.unique_customer_dids, 2);
  assert.equal(d.customers.find((c) => c.did === "did:t3n:a")?.breaches, 1);
});
