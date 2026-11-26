/**
 * Traction dashboard generator — the adoption evidence submitted with the
 * BUIDL. Reads data/checks.jsonl (written by src/agent.ts) and produces:
 *   - dashboard.json (machine-readable totals)
 *   - dashboard.html (a single static page; open it or host it anywhere)
 *
 *   npx tsx src/dashboard.ts            write dashboard.json + dashboard.html
 *   npx tsx src/dashboard.ts --serve    also serve the page on :8787
 *
 * Note: credit consumption itself is metered by T3N and visible in the
 * org activity log / getUsage(); this dashboard reports the local,
 * per-customer view of the same activity (checks + unique DIDs).
 */
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import http from "node:http";
import path from "node:path";

const LOG_PATH = path.resolve("data/checks.jsonl");

export interface CheckLogEntry {
  ts: string;
  customer_did: string;
  contract: string;
  answers: Record<string, boolean>;
  all_passed: boolean;
}

export interface DashboardData {
  generated_at: string;
  total_checks: number;
  unique_customer_dids: number;
  customers: Array<{ did: string; checks: number; last_check: string; breaches: number }>;
  first_check: string | null;
  last_check: string | null;
}

export function summarize(entries: CheckLogEntry[]): DashboardData {
  const byDid = new Map<string, { checks: number; last: string; breaches: number }>();
  for (const e of entries) {
    const row = byDid.get(e.customer_did) ?? { checks: 0, last: e.ts, breaches: 0 };
    row.checks += 1;
    row.last = e.ts > row.last ? e.ts : row.last;
    if (!e.all_passed) row.breaches += 1;
    byDid.set(e.customer_did, row);
  }
  const sorted = [...entries].sort((a, b) => (a.ts < b.ts ? -1 : 1));
  return {
    generated_at: new Date().toISOString(),
    total_checks: entries.length,
    unique_customer_dids: byDid.size,
    customers: [...byDid.entries()].map(([did, r]) => ({
      did,
      checks: r.checks,
      last_check: r.last,
      breaches: r.breaches,
    })),
    first_check: sorted[0]?.ts ?? null,
    last_check: sorted[sorted.length - 1]?.ts ?? null,
  };
}

export function renderHtml(d: DashboardData): string {
  const rows = d.customers
    .map(
      (c) =>
        `<tr><td><code>${c.did}</code></td><td>${c.checks}</td><td>${c.breaches}</td><td>${c.last_check}</td></tr>`,
    )
    .join("\n");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>VaultSinyal — traction dashboard</title>
<style>body{font-family:system-ui,sans-serif;margin:2rem;max-width:56rem}
table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:.35rem .6rem;text-align:left}
.stat{display:inline-block;margin-right:2rem}.stat b{font-size:1.6rem;display:block}</style>
</head><body>
<h1>VaultSinyal — traction dashboard</h1>
<p>Generated ${d.generated_at}. Every check below is a metered T3N contract
call by the VaultSinyal agent against a customer's own sealed trading record;
the agent only ever receives yes/no answers.</p>
<p>
<span class="stat"><b>${d.total_checks}</b>checks run</span>
<span class="stat"><b>${d.unique_customer_dids}</b>unique customer DIDs</span>
<span class="stat"><b>${d.first_check ?? "—"}</b>first check</span>
<span class="stat"><b>${d.last_check ?? "—"}</b>last check</span>
</p>
<table><tr><th>Customer DID</th><th>Checks</th><th>Checks with a failed rule</th><th>Last check</th></tr>
${rows}
</table>
</body></html>`;
}

async function main(): Promise<void> {
  const entries: CheckLogEntry[] = existsSync(LOG_PATH)
    ? (await readFile(LOG_PATH, "utf8"))
        .split("\n")
        .filter((l) => l.trim() !== "")
        .map((l) => JSON.parse(l) as CheckLogEntry)
    : [];
  const data = summarize(entries);
  await writeFile("dashboard.json", JSON.stringify(data, null, 2));
  const html = renderHtml(data);
  await writeFile("dashboard.html", html);
  console.log(`dashboard.json + dashboard.html written (${data.total_checks} checks, ${data.unique_customer_dids} DIDs)`);
  if (process.argv.includes("--serve")) {
    const port = 8787;
    http
      .createServer((_req, res) => {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(html);
      })
      .listen(port, () => console.log(`Serving dashboard at http://localhost:${port}`));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
