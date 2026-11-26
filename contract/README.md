# signal-vault — the VaultSinyal TEE contract

A private trading-record vault on T3N, following the official
`agent-vault-starter` pattern (tenant-base world, store/check/forget), with
the record and rules replaced by trading risk:

- **store** (customer, self only): saves `{ positions, risk_policy }` to the
  private map `z:<tid>:signal-vault` under the customer's DID.
- **check** (customer, or an agent granted exactly this function): answers
  yes/no per rule asked — `risk_per_position_within_limit`,
  `total_open_risk_within_limit`, `position_count_within_limit`,
  `all_positions_have_stop_loss`, `no_stop_loss_breached` (the last one uses
  public prices supplied in the call). It never returns a stored value.
- **forget** (customer, self only): deletes the record.

Risk math (integer cents, basis points): a position's risk is
`|entry − stop| / entry × notional`; without a stop the full notional is at
risk. Per-position and total risk are compared against the stored policy's
bps limits over account equity.

## Build

```bash
# 1. Vendor the host WIT packages (see wit/deps/README.md)
# 2. Install the WASI Preview 2 target once
rustup target add wasm32-wasip2
# 3. Native logic tests (no host needed)
cargo test
# 4. Build the component the SDK registers
cargo build --target wasm32-wasip2 --release
# -> target/wasm32-wasip2/release/signal_vault.wasm
```

No `cargo-component` is needed: `crate-type = ["cdylib", "lib"]` makes the
`wasm32-wasip2` target emit the component directly. Verify the interface
with `wasm-tools component wit target/wasm32-wasip2/release/signal_vault.wasm`
— it must show the three host imports and `export z:signal-vault/contracts@0.1.0`.
