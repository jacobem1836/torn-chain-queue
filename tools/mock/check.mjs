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

const shown = (h, cls) => new RegExp(`class="${cls}"[^>]*style="display: (block|flex)`).test(h);
check("admins: non-admin sees no session controls", "s=idle&open=1", (h) => !shown(h, "sessionCtl") && !shown(h, "admins"));
check("admins: an admin sees start/end and the admin list", "s=idle&open=1&admin=1", (h) => shown(h, "sessionCtl") && shown(h, "admins") && /NovaStrike/.test(h.match(/class="admlist"[\s\S]*?<\/ul>/)?.[0] || ""));
check("admins: an admin can start a session", "s=idle&open=1&admin=1&act=%23startsession", (h) => mock(h).session.active === true && mock(h).rpcs.includes("chain_set_active"));
check("admins: an admin can add a watcher", "s=idle&open=1&admin=1&fill=%23admid:3009999&act=%23admadd", (h) => mock(h).admins.some((a) => a.player_id === 3009999 && a.role === "watcher"));
check("admins: old backend hides the admin list", "s=idle&open=1&legacy=1", (h) => !shown(h, "admins") && !shown(h, "sessionCtl"));
const claimBox = (h) => h.match(/<div class="claim"[\s\S]*?<\/div><\/div>/)?.[0] || "";
check("claim: hidden while the timer is safe", "s=safe&open=1", (h) => /class="claim" hidden/.test(h));
check("claim: GOT IT button shows when critical", "s=crit&open=1", (h) => !/class="claim" hidden/.test(h) && /<button id="claim">/.test(claimBox(h)));
check("claim: one tap claims it for everyone", "s=crit&open=1&act=%23claim", (h) => mock(h).session.save_claim_name === "Yeeeeeeeeeeeeee" && /You have the save/.test(claimBox(h)));
check("claim: someone else's claim shows with a countdown", "s=crit&open=1&claim=1", (h) => /Kestrel_9 has it · \d+s/.test(claimBox(h)) && /<button id="claim" hidden/.test(claimBox(h)));
check("claim: the copy says to claim before hitting", "s=crit&open=1", (h) => /<button id="claim">✋ Got it – I'm hitting<\/button>/.test(claimBox(h)) && /BEFORE you hit/.test(claimBox(h)));
check("claim: old backend hides it", "s=crit&open=1&legacy=1", (h) => /class="claim" hidden/.test(h));
const bar = (h) => h.match(/<div id="cqbar"[^>]*>[^<]*<\/div>/)?.[0] || "";
check("phase: banner shows mode and phase on the page", "s=safe&phase=1", (h) => /data-mode="termed"/.test(bar(h)) && /TERMED · Terms hit/.test(bar(h)) && !/hidden/.test(bar(h)));
check("phase: tapping the banner hides it", "s=safe&phase=1&act=%23cqbar", (h) => /hidden/.test(bar(h)));
check("phase: no banner while idle", "s=idle&phase=1", (h) => !bar(h) || /hidden/.test(bar(h)));
check("phase: old backend shows no banner", "s=safe&legacy=1", (h) => !bar(h));
check("phase: an admin sets the banner", "s=safe&open=1&admin=1&fill=%23phmode:real,%23phtext:Opening push&act=%23phset", (h) => mock(h).session.phase_mode === "real" && /REAL FIGHT · Opening push/.test(bar(h)));
check("phase: non-admins get no phase controls", "s=safe&open=1", (h) => !/class="phasectl" style="display: block/.test(h));

const rpcs = (h) => mock(h).rpcs;
check("auto start: an admin's idle client starts the session in a live ranked war", "s=idle&admin=1&auto=1", (h) => mock(h).session.active === true && rpcs(h).includes("chain_auto_start"));
check("auto start: the owner-or-admin check keeps non-admins out", "s=idle&auto=1", (h) => mock(h).session.active === false && !rpcs(h).includes("chain_auto_start"));
check("auto start: no war, no start", "s=idle&admin=1", (h) => mock(h).session.active === false && !rpcs(h).includes("chain_auto_start"));
check("auto start: off setting is respected", "s=idle&admin=1&auto=1&autooff=1", (h) => mock(h).session.active === false && !rpcs(h).includes("chain_auto_start"));
check("auto start: a war whose session was ended is not restarted", "s=idle&admin=1&auto=1&autodone=1", (h) => mock(h).session.active === false);
check("auto start: a session that is already live is left alone", "s=safe&admin=1&auto=1", (h) => !rpcs(h).includes("chain_auto_start"));
check("auto start: old backend does nothing", "s=idle&admin=1&auto=1&legacy=1", (h) => mock(h).session.active === false && !rpcs(h).includes("chain_auto_start"));
check("auto start: an admin sees the setting", "s=idle&open=1&admin=1", (h) => !/class="autoctl" hidden/.test(h) && /id="autostart"/.test(h));
check("auto start: a chain past the threshold starts it (no war)", "s=idle&admin=1&tornchain=30", (h) => mock(h).session.active === true && mock(h).session.auto_started_key === "chain:5551");
check("auto start: a chain below the threshold does not", "s=idle&admin=1&tornchain=20", (h) => mock(h).session.active === false && !rpcs(h).includes("chain_auto_start"));
check("auto start: threshold 0 turns the chain trigger off", "s=idle&admin=1&tornchain=30&autochain=0", (h) => mock(h).session.active === false && !rpcs(h).includes("chain_auto_start"));
check("auto start: a chain the session was already started for is not restarted", "s=idle&admin=1&tornchain=30&autodone=chain", (h) => mock(h).session.active === false);
check("auto start: an admin can change the threshold", "s=safe&open=1&admin=1&fill=%23autochain:50&act=%23autostart", (h) => mock(h).session.auto_chain_min === 50);
check("auto start: toggling saves the setting", "s=safe&open=1&admin=1&act=%23autostart", (h) => mock(h).session.auto_start === false && rpcs(h).includes("chain_set_auto_start"));
check("auto start: non-admins do not see the setting", "s=idle&open=1", (h) => /class="autoctl" hidden/.test(h));

const ldnote = (h) => h.match(/<div class="ldnote"[^>]*>[^<]*<\/div>/)?.[0] || "";
check("note: the banner shows the note as text, with the phase", "s=safe&phase=1&note=1", (h) => /TERMED · Terms hit[^<]* – 📝 Dump ON after 22:00 TCT\. &lt;b&gt;Do not&lt;\/b&gt; solo hit\./.test(bar(h)) && !/<b>Do not/.test(h));
check("note: a note alone still shows a banner", "s=safe&note=1", (h) => /📝 Dump ON/.test(bar(h)) && !/data-mode/.test(bar(h)) && !/hidden/.test(bar(h)));
check("note: the sheet shows it on its own line", "s=safe&open=1&note=1", (h) => !/class="ldnote" hidden/.test(h) && /📝 Dump ON after 22:00/.test(ldnote(h)));
check("note: none set, nothing shown", "s=safe&open=1&phase=1", (h) => /class="ldnote" hidden/.test(h) && !/📝/.test(bar(h)));
check("note: no banner while idle", "s=idle&note=1", (h) => !bar(h) || /hidden/.test(bar(h)));
check("note: old backend shows no note and no control", "s=safe&open=1&legacy=1&note=1", (h) => !bar(h) && /class="row notectl" hidden/.test(h));
check("note: an admin sets it", "s=safe&open=1&admin=1&fill=%23ldnote:Hold the chain&act=%23ldset", (h) => mock(h).session.leaders_note === "Hold the chain" && /📝 Hold the chain/.test(bar(h)));
check("note: an admin's note is cut to 140 characters", "s=safe&open=1&admin=1&fill=%23ldnote:" + "x".repeat(200) + "&act=%23ldset", (h) => mock(h).session.leaders_note?.length === 140);
check("note: non-admins get no note control", "s=safe&open=1&note=1", (h) => !/class="phasectl" style="display: block/.test(h));

const roundLine = (h) => h.match(/<div class="round"[^>]*>[^<]*<\/div>/)?.[0] || "";
check("round: shows your round k/N when it is your turn", "s=safe&open=1&round=1", (h) => !/class="round" hidden/.test(h) && /Your round: 4\/10/.test(roundLine(h)) && /round 4\/10/.test(h));
check("round: the pass button shows for the player at the front", "s=safe&open=1&round=1", (h) => !/id="roundpass" hidden/.test(h));
check("round: normal mode shows no round line or pass button", "s=safe&open=1", (h) => /class="round" hidden/.test(h) && /id="roundpass" hidden/.test(h));
check("round: passing sends you to the back and clears your count", "s=safe&open=1&round=1&act=%23roundpass", (h) => mock(h).queue.at(-1).player_name === "Yeeeeeeeeeeeeee" && mock(h).queue.at(-1).round_hits === 0);
check("round: an admin switches the mode and size", "s=safe&open=1&admin=1&fill=%23qmode:round,%23qsize:6&act=%23qset", (h) => mock(h).session.queue_mode === "round" && mock(h).session.round_size === 6);
check("round: size is held between 1 and 25", "s=safe&open=1&admin=1&fill=%23qmode:round,%23qsize:99&act=%23qset", (h) => mock(h).session.round_size === 25);
check("round: non-admins get no mode control", "s=safe&open=1&round=1", (h) => /class="row roundctl" hidden/.test(h));
check("round: old backend hides it all", "s=safe&open=1&legacy=1&round=1", (h) => /class="round" hidden/.test(h) && /class="row roundctl" hidden/.test(h));

let failed = 0;
for (const c of cases) {
  let ok = false;
  try { ok = !!c.fn(dump(c.qs, c.ms)); } catch (e) { ok = false; }
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${c.name}`);
}
console.log(`${cases.length - failed}/${cases.length} passed`);
process.exit(failed ? 1 : 0);
