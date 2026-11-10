#!/usr/bin/env node
// After a failed CI build step: print the end of the build log as a GitHub
// annotation, so the error shows on the run's summary page without opening
// the full log. Usage: node scripts/log-tail.mjs <log file> [lines]
import { existsSync, readFileSync } from "node:fs";

const file = process.argv[2];
const n = Number(process.argv[3] || 60);
if (!file || !existsSync(file)) {
  console.log("::error title=Build failed::No build log was written (the step failed before building).");
  process.exit(0);
}
const lines = readFileSync(file, "utf8")
  // Strip terminal colors.
  .replace(/\u001b\[[0-9;]*[A-Za-z]/g, "")
  .split(/\r?\n/)
  .filter((l) => l.trim());
// Prefer lines around the first real error, then the very end.
const firstErr = lines.findIndex((l) => /\berror(\[E\d+\])?:|\bError:|FAILED|failed to/i.test(l));
const pick = [];
if (firstErr >= 0) pick.push(...lines.slice(Math.max(0, firstErr - 5), firstErr + 25), "…");
pick.push(...lines.slice(-n));
const esc = (s) => s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
const text = pick.join("\n").slice(-20000);
console.log(`::error title=End of build log::${esc(text)}`);
