import { test } from "node:test";
import assert from "node:assert/strict";
import { developerApiKey, loadAgentConfig } from "../src/config.js";

test("developerApiKey: T3_API_KEY wins, T3N_API_KEY is the fallback, neither throws", () => {
  const saved = { a: process.env["T3_API_KEY"], b: process.env["T3N_API_KEY"] };
  try {
    delete process.env["T3_API_KEY"];
    delete process.env["T3N_API_KEY"];
    assert.throws(() => developerApiKey(), /T3_API_KEY/);
    process.env["T3N_API_KEY"] = "docs-name-key";
    assert.equal(developerApiKey(), "docs-name-key");
    process.env["T3_API_KEY"] = "project-name-key";
    assert.equal(developerApiKey(), "project-name-key");
  } finally {
    if (saved.a === undefined) delete process.env["T3_API_KEY"];
    else process.env["T3_API_KEY"] = saved.a;
    if (saved.b === undefined) delete process.env["T3N_API_KEY"];
    else process.env["T3N_API_KEY"] = saved.b;
  }
});

test("loadAgentConfig does not require the developer key", () => {
  const cfg = loadAgentConfig();
  assert.equal(cfg.contractTail, process.env["CONTRACT_TAIL"] ?? "signal-vault");
  assert.equal(cfg.contractVersion, process.env["CONTRACT_VERSION"] ?? "0.1.0");
});
