//! Native tests for the VaultSinyal contract logic. Run with `cargo test`
//! (no WASM target or host needed — logic.rs never touches the host).

use signal_vault::logic::{evaluate, parse_record, parse_rules, position_risk_cents, TradingRecord};

fn record() -> TradingRecord {
    serde_json::from_str(
        r#"{
          "positions": [
            { "asset": "BTCUSDT", "side": "long", "entry_price_cents": 9000000,
              "size_cents": 500000, "stop_loss_price_cents": 8550000, "opened_on": "2026-11-20" },
            { "asset": "ETHUSDT", "side": "long", "entry_price_cents": 310000,
              "size_cents": 300000, "opened_on": "2026-11-22" }
          ],
          "risk_policy": {
            "max_risk_per_position_bps": 200,
            "max_total_open_risk_bps": 500,
            "max_positions": 5,
            "account_equity_cents": 5000000,
            "require_stop_loss": true
          }
        }"#,
    )
    .expect("fixture parses")
}

fn rules(json: &str) -> signal_vault::logic::Rules {
    parse_rules(json.as_bytes()).expect("rules parse")
}

#[test]
fn risk_math_matches_reference() {
    let r = record();
    // 5% stop distance on 500_000 notional = 25_000; no stop = full notional.
    assert_eq!(position_risk_cents(&r.positions[0]), 25_000);
    assert_eq!(position_risk_cents(&r.positions[1]), 300_000);
}

#[test]
fn per_position_limit() {
    let r = record();
    let answers = evaluate(&r, &rules(r#"{"rules":{"risk_per_position_within_limit":true}}"#));
    assert_eq!(answers["risk_per_position_within_limit"], false); // ETH position: 600 bps > 200
    let one = TradingRecord { positions: vec![r.positions[0].clone()], risk_policy: r.risk_policy.clone() };
    let answers = evaluate(&one, &rules(r#"{"rules":{"risk_per_position_within_limit":true}}"#));
    assert_eq!(answers["risk_per_position_within_limit"], true); // 50 bps <= 200
}

#[test]
fn combined_rules() {
    let r = record();
    let answers = evaluate(
        &r,
        &rules(r#"{"rules":{"total_open_risk_within_limit":true,"position_count_within_limit":true,"all_positions_have_stop_loss":true}}"#),
    );
    assert_eq!(answers["total_open_risk_within_limit"], false); // 650 bps > 500
    assert_eq!(answers["position_count_within_limit"], true);
    assert_eq!(answers["all_positions_have_stop_loss"], false);
}

#[test]
fn stop_breach_uses_public_prices() {
    let r = record();
    let one = TradingRecord { positions: vec![r.positions[0].clone()], risk_policy: r.risk_policy.clone() };
    let ok = evaluate(&one, &rules(r#"{"rules":{"no_stop_loss_breached":true,"prices":{"BTCUSDT":8600000}}}"#));
    assert_eq!(ok["no_stop_loss_breached"], true);
    let breached = evaluate(&one, &rules(r#"{"rules":{"no_stop_loss_breached":true,"prices":{"BTCUSDT":8500000}}}"#));
    assert_eq!(breached["no_stop_loss_breached"], false);
}

#[test]
fn validation_and_rule_guards() {
    assert!(parse_record(br#"{"positions":[],"risk_policy":{"max_risk_per_position_bps":200,"max_total_open_risk_bps":500,"max_positions":5,"account_equity_cents":0,"require_stop_loss":true}}"#).is_err());
    assert!(parse_rules(br#"{"rules":{"risk_per_position_within_limit":false}}"#).is_err());
    assert!(parse_rules(br#"{"rules":{}}"#).is_err());
}
