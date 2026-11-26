/**
 * Contract call payloads.
 *
 * The TEE contract exports the `contracts` WIT interface whose functions
 * take a `generic-input` record; the host encodes the call's `input` value
 * to the byte list the guest receives. Responses come back as
 * JSON (object or JSON string) shaped like:
 *   { "answers": { "<rule>": true|false, ... }, "custom": { ... } }
 * `custom` labels are lifted onto the call's activity-log entry by the node.
 *
 * VERIFIED ON FIRST LIVE RUN (26 Nov 2026): the node JSON-encodes the
 * execute/invoke `input` value itself into the guest's byte list, so the
 * payload must be the raw value (record / { rules } object), NOT a
 * `{ input: "<json string>" }` wrapper — the wrapper made the contract
 * receive the wrapper JSON and reject it ("not a trading record").
 * This module remains the single place that shapes call payloads.
 */
export function buildContractInput<T>(value: T): T {
  return value;
}

export interface CheckResponse {
  answers: Record<string, boolean>;
  custom?: Record<string, string>;
}

export function parseCheckResponse(raw: unknown): CheckResponse {
  let value: unknown = raw;
  if (typeof value === "string") {
    value = JSON.parse(value);
  }
  if (typeof value !== "object" || value === null || !("answers" in value)) {
    throw new Error(`Unexpected contract response shape: ${JSON.stringify(raw)?.slice(0, 200)}`);
  }
  const answers = (value as { answers: unknown }).answers;
  if (typeof answers !== "object" || answers === null) {
    throw new Error("Contract response has no answers object.");
  }
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(answers as Record<string, unknown>)) {
    if (typeof v !== "boolean") throw new Error(`Answer for "${k}" is not a boolean.`);
    out[k] = v;
  }
  const custom = (value as { custom?: Record<string, string> }).custom;
  return { answers: out, custom };
}
