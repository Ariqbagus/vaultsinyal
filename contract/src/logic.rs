//! Pure logic for VaultSinyal: trading-record validation, caller rules and
//! the yes/no risk checks. Nothing here touches the host, so it all runs
//! under `cargo test` natively.
//!
//! SEMANTICS MIRROR: `../../src/risk.ts` in the TypeScript app is a
//! reference implementation of exactly these rules. If the two ever
//! disagree, this file (the contract) is the source of truth.
//!
//! All money values are integer cents. All percentages are basis points
//! (bps): 200 bps = 2%.

use alloc::collections::BTreeMap;
use alloc::format;
use alloc::string::{String, ToString};
use alloc::vec::Vec;
use core::fmt;

use serde::{Deserialize, Serialize};

pub const VAULT_MAP_TAIL: &str = "signal-vault";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Position {
    pub asset: String,
    pub side: Side,
    pub entry_price_cents: i64,
    /// Notional size of the position, in cents.
    pub size_cents: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stop_loss_price_cents: Option<i64>,
    /// YYYY-MM-DD
    pub opened_on: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Side {
    Long,
    Short,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RiskPolicy {
    pub max_risk_per_position_bps: u32,
    pub max_total_open_risk_bps: u32,
    pub max_positions: u32,
    pub account_equity_cents: i64,
    /// The owner's stated intent. Stored as policy context; the
    /// `all_positions_have_stop_loss` check answers the factual question
    /// regardless of this flag.
    pub require_stop_loss: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TradingRecord {
    pub positions: Vec<Position>,
    pub risk_policy: RiskPolicy,
}

/// Each rule is a question. Only the rules present are answered. The flag
/// rules accept only `true`: leave a rule out rather than send `false`.
/// `prices` carries PUBLIC market quotes (asset -> price in cents) supplied
/// by the caller; only the `no_stop_loss_breached` rule uses them.
#[derive(Debug, Clone, Default, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Rules {
    pub risk_per_position_within_limit: Option<bool>,
    pub total_open_risk_within_limit: Option<bool>,
    pub position_count_within_limit: Option<bool>,
    pub all_positions_have_stop_loss: Option<bool>,
    pub no_stop_loss_breached: Option<bool>,
    pub prices: Option<BTreeMap<String, i64>>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CheckInput {
    pub rules: Rules,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum VaultError {
    NoCallingUser,
    DelegatedCallerNotAllowed,
    InvalidInput(String),
    InvalidRecord(String),
    InvalidRules(String),
    NoRecord,
    CorruptRecord,
}

impl fmt::Display for VaultError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NoCallingUser => f.write_str("no calling user: call this contract through an authenticated T3N session"),
            Self::DelegatedCallerNotAllowed => f.write_str("only the customer can do this for themselves; an agent cannot"),
            Self::InvalidInput(e) => write!(f, "invalid input: {e}"),
            Self::InvalidRecord(e) => write!(f, "invalid record: {e}"),
            Self::InvalidRules(e) => write!(f, "invalid rules: {e}"),
            Self::NoRecord => f.write_str("no record stored for this customer"),
            Self::CorruptRecord => f.write_str("stored record could not be read"),
        }
    }
}

/// `store` and `forget`: only the customer, acting for themselves. The
/// record key is their own DID, so nobody can write or delete another
/// customer's row.
pub fn self_only_key(calling_user: Option<&[u8]>, is_delegated: bool) -> Result<Vec<u8>, VaultError> {
    let user = calling_user.ok_or(VaultError::NoCallingUser)?;
    if is_delegated {
        return Err(VaultError::DelegatedCallerNotAllowed);
    }
    Ok(record_key(user))
}

/// `check`: the customer, or an agent they granted. On a delegated call the
/// host sets `calling-user-did` to the customer (`pii_did`), so the agent
/// can only ever reach the record of whoever granted it.
pub fn subject_key(calling_user: Option<&[u8]>) -> Result<Vec<u8>, VaultError> {
    calling_user.map(record_key).ok_or(VaultError::NoCallingUser)
}

pub fn record_key(did: &[u8]) -> Vec<u8> {
    hex::encode(did).into_bytes()
}

pub fn parse_record(bytes: &[u8]) -> Result<TradingRecord, VaultError> {
    // serde's message can quote the offending value, so it is not passed on.
    let record: TradingRecord = serde_json::from_slice(bytes)
        .map_err(|e| VaultError::InvalidRecord(format!("not a trading record (line {}, column {})", e.line(), e.column())))?;
    validate_record(&record)?;
    Ok(record)
}

fn validate_record(r: &TradingRecord) -> Result<(), VaultError> {
    let bad = |field: &str, why: &str| Err(VaultError::InvalidRecord(format!("{field}: {why}")));
    if r.risk_policy.account_equity_cents <= 0 {
        return bad("risk_policy.account_equity_cents", "must be positive (cents)");
    }
    for (i, p) in r.positions.iter().enumerate() {
        if p.asset.trim().is_empty() {
            return bad("asset", "must not be empty");
        }
        if p.entry_price_cents <= 0 {
            return bad("entry_price_cents", "must be positive (cents)");
        }
        if p.size_cents <= 0 {
            return bad("size_cents", "must be positive (cents)");
        }
        if let Some(stop) = p.stop_loss_price_cents {
            if stop <= 0 {
                return bad("stop_loss_price_cents", "must be positive (cents)");
            }
        }
        if !is_date_shape(&p.opened_on) {
            return bad("opened_on", "must be a date in YYYY-MM-DD form");
        }
        let _ = i;
    }
    Ok(())
}

fn is_date_shape(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() == 10 && b[4] == b'-' && b[7] == b'-' && b.iter().enumerate().all(|(i, c)| i == 4 || i == 7 || c.is_ascii_digit())
}

pub fn parse_rules(bytes: &[u8]) -> Result<Rules, VaultError> {
    let input: CheckInput = serde_json::from_slice(bytes).map_err(|e| VaultError::InvalidInput(e.to_string()))?;
    let r = &input.rules;
    for (name, flag) in [
        ("risk_per_position_within_limit", r.risk_per_position_within_limit),
        ("total_open_risk_within_limit", r.total_open_risk_within_limit),
        ("position_count_within_limit", r.position_count_within_limit),
        ("all_positions_have_stop_loss", r.all_positions_have_stop_loss),
        ("no_stop_loss_breached", r.no_stop_loss_breached),
    ] {
        if flag == Some(false) {
            return Err(VaultError::InvalidRules(format!("{name} accepts only true; leave it out to skip it")));
        }
    }
    if r.risk_per_position_within_limit.is_none()
        && r.total_open_risk_within_limit.is_none()
        && r.position_count_within_limit.is_none()
        && r.all_positions_have_stop_loss.is_none()
        && r.no_stop_loss_breached.is_none()
    {
        return Err(VaultError::InvalidRules("ask at least one rule".to_string()));
    }
    Ok(input.rules)
}

/// Risk of one position in cents: |entry - stop| / entry * notional.
/// Without a stop, the whole notional is at risk.
pub fn position_risk_cents(p: &Position) -> i64 {
    match p.stop_loss_price_cents {
        None => p.size_cents,
        Some(stop) => {
            let distance = (p.entry_price_cents as i128 - stop as i128).abs();
            ((distance * p.size_cents as i128) / p.entry_price_cents as i128) as i64
        }
    }
}

pub fn risk_bps(risk_cents: i64, equity_cents: i64) -> i64 {
    if equity_cents <= 0 {
        return i64::MAX;
    }
    ((risk_cents as i128 * 10_000) / equity_cents as i128) as i64
}

/// One boolean per rule asked, keyed by the rule's name. Never a value.
pub fn evaluate(record: &TradingRecord, rules: &Rules) -> BTreeMap<&'static str, bool> {
    let policy = &record.risk_policy;
    let mut out = BTreeMap::new();

    if rules.risk_per_position_within_limit.is_some() {
        out.insert(
            "risk_per_position_within_limit",
            record
                .positions
                .iter()
                .all(|p| risk_bps(position_risk_cents(p), policy.account_equity_cents) <= i64::from(policy.max_risk_per_position_bps)),
        );
    }
    if rules.total_open_risk_within_limit.is_some() {
        let total: i64 = record.positions.iter().map(position_risk_cents).sum();
        out.insert(
            "total_open_risk_within_limit",
            risk_bps(total, policy.account_equity_cents) <= i64::from(policy.max_total_open_risk_bps),
        );
    }
    if rules.position_count_within_limit.is_some() {
        out.insert("position_count_within_limit", record.positions.len() <= policy.max_positions as usize);
    }
    if rules.all_positions_have_stop_loss.is_some() {
        out.insert(
            "all_positions_have_stop_loss",
            record.positions.iter().all(|p| p.stop_loss_price_cents.is_some()),
        );
    }
    if rules.no_stop_loss_breached.is_some() {
        let prices = rules.prices.clone().unwrap_or_default();
        out.insert(
            "no_stop_loss_breached",
            record.positions.iter().all(|p| match (p.stop_loss_price_cents, prices.get(&p.asset)) {
                (Some(stop), Some(&price)) => match p.side {
                    Side::Long => price > stop,
                    Side::Short => price < stop,
                },
                // No stop, or no public quote for the asset: not breached.
                _ => true,
            }),
        );
    }
    out
}
