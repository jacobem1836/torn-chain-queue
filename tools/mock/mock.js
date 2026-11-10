// Local test harness: stands in for Tampermonkey, the Torn API, the shared Supabase backend, and the TCM chain feed,
// so the userscript runs on a plain page with fixture data. Nothing here talks to a real server.
// Query string: s=safe|warn|crit|idle, open=1 (open the panel), compact=1, feed=1 (TCM feed on), feedfail=1,
// legacy=1 (backend without the proposed migration), admin=1 (viewer is a session admin), claim=1, phase=1,
// lead=1 (viewer is the chain leader), expand=<selectors> (open those <details>).
(() => {
  const P = new URLSearchParams(location.search);
  const on = (k) => P.get(k) === "1";
  const scenario = P.get("s") || "safe";
  const nowS = () => Math.floor(Date.now() / 1000);
  const left = { safe: 268, warn: 128, crit: 71, idle: 0 }[scenario] ?? 268;
  const ME = { id: 2141838, name: "Yeeeeeeeeeeeeee" };
  const names = ["NovaStrike", "PaperTiger", ME.name, "Kestrel_9", "Quietus", "LowTideLou", "Brassneck"];
  const store = {};
  const legacy = on("legacy");
  const idOf = (n, i) => (n === ME.name ? ME.id : 3001000 + i + 1);
  const leaderName = on("lead") ? ME.name : "NovaStrike";

  window.getCurrentTimestamp = () => Date.now();
  // Web Locks never grant in headless virtual time; hiding them makes the script use its localStorage poll lease.
  try { Object.defineProperty(navigator, "locks", { value: undefined }); } catch (e) {}
  window.GM_getValue = (k) => store[k];
  window.GM_setValue = (k, v) => { store[k] = v; };
  window.GM_addValueChangeListener = () => {};
  window.confirm = () => true;
  window.alert = () => {};
  localStorage.clear();
  store["chainQueue.tornApiKey"] = "MOCKKEY000000000";
  if (on("feed")) { store["chainQueue.tcmFeed"] = "1"; store["chainQueue.tcmToken"] = on("badtoken") ? "revoked" : "mock-token"; }
  window.__mockStore = store;
  // Realtime is not mocked: the script falls back to its 30 s reload.
  window.WebSocket = function () { const s = { readyState: 3, send() {}, close() {} }; setTimeout(() => s.onclose?.(), 0); return s; };

  const end = nowS() + left;
  const claim = on("claim");
  const db = {
    session: {
      session_id: "sot-41259", active: scenario !== "idle", leader_id: on("lead") ? ME.id : 3001001, leader_name: leaderName,
      trigger_seconds: 240, paused: false, manual_hit_player_id: null, manual_hit_at: null, last_attack_id: "a1",
      leader_heartbeat_at: new Date().toISOString(), chain_count: scenario === "idle" ? 0 : 1842, chain_max: 2500,
      chain_end_at: scenario === "idle" ? 0 : end, chain_torn_timestamp: nowS() - 12, chain_cooldown_at: 0,
      ...(legacy ? {} : {
        phase_mode: on("phase") ? "termed" : null,
        phase_text: on("phase") ? "Terms hit. Buddy rounds of 10, no solo hits." : null,
        phase_set_by: on("phase") ? "NovaStrike" : null,
        save_claim_player_id: claim ? 3001004 : null, save_claim_name: claim ? "Kestrel_9" : null,
        save_claim_until: claim ? new Date(Date.now() + 45000).toISOString() : null,
      }),
    },
    queue: scenario === "idle" ? [] : names.map((n, i) => ({
      session_id: "sot-41259", player_id: idOf(n, i), player_name: n, position: i + 1,
      energy_current: [150, 75, 250, 1000, 25, null, 100][i], energy_max: 150, can_lead: true,
    })),
    admins: [{ session_id: "sot-41259", player_id: 3001001, player_name: "NovaStrike", role: "leader" },
      { session_id: "sot-41259", player_id: 3001002, player_name: "PaperTiger", role: "officer" },
      ...(on("admin") ? [{ session_id: "sot-41259", player_id: ME.id, player_name: ME.name, role: "watcher" }] : [])],
    calls: [],
  };

  const isAdmin = (id) => db.admins.some((a) => a.player_id === id);
  const rpc = {
    chain_open_faction: () => "sot-41259",
    chain_apply_snapshot: (b) => {
      if (b.p_torn_timestamp < db.session.chain_torn_timestamp) return false;
      Object.assign(db.session, { chain_torn_timestamp: b.p_torn_timestamp, chain_count: b.p_current, chain_max: b.p_max, chain_end_at: b.p_end });
      return true;
    },
    chain_claim_save: (b) => {
      const s = db.session;
      if (s.save_claim_until && Date.parse(s.save_claim_until) > Date.now()) return false;
      Object.assign(s, { save_claim_player_id: b.p_player_id, save_claim_name: b.p_player_name, save_claim_until: new Date(Date.now() + b.p_seconds * 1000).toISOString() });
      return true;
    },
    chain_set_phase: (b) => {
      if (!isAdmin(b.p_player_id)) return false;
      Object.assign(db.session, { phase_mode: b.p_mode, phase_text: b.p_text, phase_set_by: ME.name });
      return true;
    },
    chain_set_active: (b) => { if (!isAdmin(b.p_player_id)) return false; db.session.active = b.p_active; return true; },
    chain_admin_add: (b) => { if (!isAdmin(b.p_player_id)) return false; db.admins.push({ session_id: "sot-41259", player_id: b.p_admin_id, player_name: b.p_admin_name, role: b.p_role }); return true; },
    chain_admin_remove: (b) => { if (!isAdmin(b.p_player_id)) return false; db.admins = db.admins.filter((a) => a.player_id !== b.p_admin_id); return true; },
  };

  function route(method, url, body, headers) {
    const u = new URL(url);
    db.calls.push(method + " " + u.host + u.pathname);
    if (u.host === "api.torn.com") {
      const p = u.pathname.replace("/v2", "");
      if (p === "/user/basic") return { profile: ME };
      if (/^\/user\/\d+\/basic$/.test(p)) return { profile: { id: +p.split("/")[2], name: "Watcher" + p.split("/")[2].slice(-2) } };
      if (p === "/user/faction") return { faction: { id: 41259 } };
      if (p === "/faction/timestamp") return { timestamp: nowS() };
      if (p === "/faction") return { timestamp: nowS(), chain: { current: db.session.chain_count, max: 2500, end: db.session.chain_end_at, cooldown: 0 } };
      if (p === "/user/bars") return { bars: { energy: { current: 250, maximum: 150 } } };
      return { attacks: [] };
    }
    if (u.host === "torncitymanager.com") {
      if (u.pathname === "/api/script/link") return { token: "mock-token", player: { id: ME.id, name: ME.name, tier: "free" }, faction: { id: 41259, name: "Mock", tier: "free" } };
      if (u.pathname === "/api/chain/feed") {
        if (on("feedfail")) return { __status: 503, error: "unavailable" };
        if (headers?.["x-tcm-token"] !== "mock-token") return { __status: 401, error: "relink" };
        // One hit newer than the leader's last Torn read: count + 1 and 9 s more on the timer.
        const age = on("feedstale") ? 90 : 3;
        return { now: Date.now() / 1000, chain: scenario !== "idle" ? { current: 1843, max: 2500, end: end + 9, cooldown: 0, start: 1 } : null, cooldown: 0, updated: nowS() - age, age, keys: 8 };
      }
    }
    const rest = u.pathname.replace("/rest/v1/", "");
    if (rest.startsWith("rpc/")) {
      const fn = rest.slice(4);
      if (legacy && !["chain_open_faction", "chain_set_active"].includes(fn) && rpc[fn]) return { __status: 404, message: "Could not find the function" };
      if (legacy && fn === "chain_set_active") return JSON.parse(body || "{}").p_player_id === 4315564;
      const f = rpc[fn];
      return f ? f(JSON.parse(body || "{}")) : true;
    }
    if (rest === "chain_queue") return db.queue;
    if (rest === "chain_sessions") return [db.session];
    if (rest === "chain_client_config") return [{ latest_version: "0.9.35", minimum_version: "0.9.35" }];
    if (rest === "chain_session_admins") return legacy ? { __status: 404, message: "relation does not exist" } : db.admins;
    return [];
  }

  window.GM_xmlhttpRequest = ({ method, url, data, headers, onload }) => {
    setTimeout(() => {
      const r = route(method, url, data, headers);
      onload({ status: r && r.__status ? r.__status : 200, responseText: JSON.stringify(r) });
    }, 20);
  };
  window.__mockDb = db;
  // For check.sh: mirror the fake backend's state into the DOM so --dump-dom can see it.
  setInterval(() => {
    if (!document.body) return;
    const { calls, ...rest } = db;
    document.body.dataset.mock = JSON.stringify({ ...rest, store, rpcs: calls.filter((c) => c.includes("/rpc/")).map((c) => c.split("/rpc/")[1]) });
  }, 200);

  if (on("open")) {
    const t = setInterval(() => {
      const b = document.querySelector("#cq .bubble");
      if (!b) return;
      clearInterval(t);
      b.click();
      if (on("compact")) document.querySelector("#cq .compactBtn")?.click();
      for (const sel of (P.get("expand") || "").split(",").filter(Boolean)) document.querySelector("#cq " + sel)?.setAttribute("open", "");
    }, 50);
  }
  // fill=<selector>:<value>,... then act=<selector>,... clicked 400 ms apart, starting 1.5 s after load.
  setTimeout(() => {
    for (const f of (P.get("fill") || "").split(",").filter(Boolean)) {
      const [sel, val] = f.split(":");
      const el = document.querySelector(sel);
      if (el) el.value = val;
    }
    (P.get("act") || "").split(",").filter(Boolean).forEach((sel, i) => setTimeout(() => document.querySelector(sel)?.click(), i * 400));
  }, 1500);
})();
