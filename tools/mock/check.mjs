// Runs the userscript on the mock page in headless Chrome for each case and checks the rendered panel.
// Serve the repo root first: python3 -m http.server 8765 --bind 127.0.0.1. Then: node tools/mock/check.mjs
import { execFileSync } from "node:child_process";

const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const dump = (qs, ms = 4000) => execFileSync(CHROME, ["--headless=new", "--disable-gpu", `--virtual-time-budget=${ms}`, "--dump-dom",
  `http://127.0.0.1:8765/tools/mock/torn.html?${qs}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
const text = (html, cls) => (html.match(new RegExp(`class="${cls}(?: [^"]*)?"[^>]*>([^<]*)<`)) || [])[1] ?? null;
const attr = (html, cls, a) => (html.match(new RegExp(`class="${cls}(?: [^"]*)?"[^>]*${a}="([^"]*)"`)) || [])[1] ?? null;
const mock = (html) => JSON.parse((html.match(/data-mock="([^"]*)"/) || [, "{}"])[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"));

const cases = [];
const check = (name, qs, fn, ms) => cases.push({ name, qs, fn, ms });

check("timer state safe", "s=safe&open=1", (h) => attr(h, "hero", "data-state") === "safe" && text(h, "state") === "SAFE");
check("timer state warn", "s=warn&open=1", (h) => attr(h, "hero", "data-state") === "warn" && text(h, "state") === "LOW");
check("timer state crit", "s=crit&open=1", (h) => attr(h, "hero", "data-state") === "crit" && text(h, "state") === "SAVE IT");
check("idle has no timer state", "s=idle&open=1", (h) => attr(h, "hero", "data-state") === "off");
check("source is Torn without the feed", "s=safe&open=1", (h) => /^via Torn/.test(text(h, "src") || ""));
check("feed on: source is TCM and count comes from it", "s=safe&open=1&feed=1", (h) => /^via TCM/.test(text(h, "src") || "") && text(h, "chain") === "1843/2500");
check("feed failing: falls back to Torn", "s=safe&open=1&feed=1&feedfail=1", (h) => /^via Torn.*TCM error/.test(text(h, "src") || "") && text(h, "chain") === "1842/2500");
check("feed on, leader: shares the newer reading", "s=safe&open=1&feed=1&lead=1", (h) => mock(h).session.chain_count === 1843 && mock(h).rpcs.includes("chain_apply_snapshot"));
check("feed stale (snapshot 90 s old): falls back to Torn", "s=safe&open=1&feed=1&feedstale=1", (h) => /^via Torn/.test(text(h, "src") || "") && text(h, "chain") === "1842/2500");
check("feed token revoked: turns the feed off and says so", "s=safe&open=1&feed=1&badtoken=1", (h) => /^via Torn/.test(text(h, "src") || "") && /relink/.test(text(h, "msg") || "") && mock(h).store["chainQueue.tcmFeed"] === "0");
check("feed on, not leader: never writes snapshots", "s=safe&open=1&feed=1", (h) => !mock(h).rpcs.includes("chain_apply_snapshot"));

let failed = 0;
for (const c of cases) {
  let ok = false;
  try { ok = !!c.fn(dump(c.qs, c.ms)); } catch (e) { ok = false; }
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${c.name}`);
}
console.log(`${cases.length - failed}/${cases.length} passed`);
process.exit(failed ? 1 : 0);
