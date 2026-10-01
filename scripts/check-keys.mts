// Live check of every external service using .env.local. Run with: npm run check
import { runHealthChecks, type CheckStatus } from "../src/lib/health.ts";

const ICON: Record<CheckStatus, string> = { ok: "✅", warn: "⚠️ ", fail: "❌" };

const results = await runHealthChecks({ live: true });
for (const r of results) {
  console.log(`${ICON[r.status]} ${r.name.padEnd(44)} ${String(r.ms).padStart(6)}ms  ${r.detail}`);
}

const failed = results.filter((r) => r.status === "fail").length;
const warned = results.filter((r) => r.status === "warn").length;
console.log(failed ? `\n${failed} check(s) failed.` : warned ? `\nAll reachable, ${warned} warning(s).` : "\nAll services OK.");
process.exit(failed ? 1 : 0);
