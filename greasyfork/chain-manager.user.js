// ==UserScript==
// @name         Cloudy's Chain Manager
// @namespace    https://github.com/gregapackard/torn-chain-queue
// @version      0.9.35
// @description  Shared Torn faction chain queue with live turn order, energy, chain timer, hit detection, leader controls, and turn alerts.
// @author       CloudyMuffin440
// @license      MIT
// @match        https://www.torn.com/*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @connect      api.torn.com
// @connect      axpmotlarzmmhjggmgce.supabase.co
// @connect      torncitymanager.com
// @homepageURL  https://github.com/gregapackard/torn-chain-queue
// @supportURL   https://github.com/gregapackard/torn-chain-queue/issues
// ==/UserScript==
(()=>{"use strict";
const PDAK="###PDA-APIKEY###",U="https://axpmotlarzmmhjggmgce.supabase.co",K="sb_publishable_hIkbXGYNCkv-Gm4aaDFxcQ_t1pX8Urw",A="https://api.torn.com/v2",KS="chainQueue.tornApiKey",PS="chainQueue.pos",SS="chainQueue.sound",OWNER_ID=4315564;let S="pending",factionId=0,activeLoop=false,rtSocket=null,rtHeartbeat=null,rtRef=0,rtJoined=false,lastFailoverCheck=0,rtReconnectAttempt=0,rtJoinRef=null,rtJoinTopic=null,rtLoadSerial=0,rtStateRevision=0;
const VERSION="0.9.35";let versionState={latest:VERSION,minimum:VERSION,blocked:false,update:false,checked:false};const vercmp=(a,b)=>{let A=String(a).split(".").map(Number),B=String(b).split(".").map(Number);for(let i=0;i<Math.max(A.length,B.length);i++){let d=(A[i]||0)-(B[i]||0);if(d)return d>0?1:-1}return 0};let me=null,q=[],secs=null,count=0,apiFails=0,myAttackCursor=null,lastSharedLoad=0,lastTimerSync=0,lastEnergyPush=0,lastNextId=null,lastQueueSig=null,audioCtx=null,pdaHttpChain=Promise.resolve(),tornClockOffset=0,lastTornClockSync=0,lastChainSnapshotPoll=0,lastMinePoll=0,lastLeaderPoll=0,lastHeartbeat=0,optimisticEndAt=0,optimisticSnapshotTs=0,canLead=true,errorSent=new Map(),diag={queue:false,id:false,key:false,torn:false,energy:false,last:""},session={active:false,leader_id:null,leader_name:null,trigger_seconds:240,paused:false,manual_hit_player_id:null,last_attack_id:null,chain_timer_seconds:null,chain_timer_synced_at:null,chain_count:0,chain_end_at:null,chain_max:0,chain_torn_timestamp:null,chain_cooldown_at:null};
const $=x=>document.querySelector(x),cq=x=>document.querySelector("#cq "+x),storeGet=(k,d="")=>{try{let v=GM_getValue(k);if(v!==undefined&&v!==null&&v!=="")return v}catch{}try{return localStorage.getItem(k)??d}catch{return d}},storeSet=(k,v)=>{try{GM_setValue(k,v)}catch{}try{localStorage.setItem(k,v)}catch{}},fmt=n=>n==null?"--:--":Math.floor(n/60)+":"+String(Math.max(0,n%60)).padStart(2,"0");
const css=`#cq{position:fixed;z-index:999999;font:13px Arial,sans-serif;color:#dde1e7;--safe:#52e2a4;--warn:#ffc857;--crit:#ff5b5b;--mute:#9aa3b1;--line:#30343b;--bg:#15171b}#cq .bubble,#cq h3{touch-action:none}#cq input,#cq button,#cq select{touch-action:auto;pointer-events:auto}#cq .bubble{min-width:44px;height:44px;padding:0 10px;box-sizing:border-box;border-radius:22px;display:grid;place-items:center;background:var(--bg);border:2px solid #4a505b;box-shadow:0 4px 15px #0009;color:#fff;font-weight:900;font-size:15px;font-variant-numeric:tabular-nums;cursor:grab;user-select:none}#cq .bubble[data-state=safe]{border-color:var(--safe);color:var(--safe)}#cq .bubble[data-state=warn]{border-color:var(--warn);color:var(--warn)}#cq .bubble[data-state=crit]{border-color:var(--crit);color:#fff;background:#5a1820}#cq.open .bubble{display:none}#cq .panel{display:none;width:280px;max-width:calc(100vw - 12px);max-height:calc(100vh - 12px);background:var(--bg);border:1px solid #383c45;border-radius:10px;box-shadow:0 8px 28px #0009;overflow:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;box-sizing:border-box}#cq.open .panel{display:block}#cq h3{margin:0;padding:4px 4px 4px 10px;background:#101216;color:#fff;font-size:11px;letter-spacing:.4px;cursor:grab;user-select:none;position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:6px}#cq h3 .ttl{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#cq #st{font-size:10px;padding:2px 6px;border-radius:9px;background:#2a2e35;color:var(--mute)}#cq #st[data-s=LIVE]{background:#173a2b;color:var(--safe)}#cq #st[data-s=ERROR]{background:#4a1a1f;color:var(--crit)}#cq h3 .min,#cq h3 .compactBtn{display:grid;place-items:center;width:32px;height:32px;border-radius:6px;cursor:pointer;font-size:14px;color:#cbd1da}#cq h3 .min:hover,#cq h3 .compactBtn:hover{background:#2a2e35}#cq.compact .panel{width:220px}#cq.compact #st{display:none}#cq.compact .b{padding:6px}#cq.compact .acts,#cq.compact .energySummary,#cq.compact .list,#cq.compact .lead,#cq.compact .admin,#cq.compact .settings,#cq.compact .diag,#cq.compact .meta,#cq.compact .msg{display:none!important}#cq.compact .hero{padding:6px}#cq.compact .tm{font-size:34px}#cq.compact .compactRoster{display:block}#cq:not(.compact) .compactRoster{display:none}.compactRoster{margin-top:6px;border-top:1px solid var(--line);padding-top:5px;font-size:12px;text-align:left}.compactRoster .cr{display:grid;grid-template-columns:64px 1fr;gap:6px;padding:2px 0}.compactRoster .cr b{color:var(--safe);font-size:10px;align-self:center}.compactRoster .you{margin-top:4px;color:var(--warn);font-weight:800}.b{padding:8px}.hero{text-align:center;border:1px solid #333842;border-left-width:4px;border-radius:8px;padding:6px 8px 8px;background:#1b1e23}.hero[data-state=safe]{border-color:#2c6b52}.hero[data-state=safe] .tm,.hero[data-state=safe] .state{color:var(--safe)}.hero[data-state=warn]{border-color:#8a6a24;background:#221d12}.hero[data-state=warn] .tm,.hero[data-state=warn] .state{color:var(--warn)}.hero[data-state=crit]{border-color:#c6424d;background:#2b1518}.hero[data-state=crit] .tm,.hero[data-state=crit] .state{color:var(--crit)}.hero.mine{background:#5a1820;border-color:#ff5b5b;box-shadow:0 0 0 2px #ff5b5b55}.hero.mine .nx,.hero.mine .call{color:#fff}.hrow{display:flex;justify-content:space-between;align-items:center;font-size:11px;font-weight:900;letter-spacing:.5px}.hrow .state{color:var(--mute)}.hrow .chain{color:#cbd1da;font-variant-numeric:tabular-nums}.tm{font-size:46px;line-height:1.05;font-weight:900;font-variant-numeric:tabular-nums;color:#fff;margin-top:2px}.src{font-size:10px;color:var(--mute);min-height:12px}.call{font-size:12px;font-weight:700;margin-top:4px;color:#e6e9ee}.nx{font-size:18px;font-weight:900;margin:2px 0 0;color:#fff;overflow-wrap:anywhere}.key{display:flex;gap:4px;margin:6px 0}.key input{min-width:0;flex:1;background:#0d0f12;color:#ddd;border:1px solid #363b44;border-radius:6px;padding:6px;font-size:12px}#cq button{min-height:40px;border:1px solid #59616e;border-radius:6px;padding:6px 10px;font-size:12px;font-weight:800;cursor:pointer;background:#343a44;color:#fff;text-shadow:0 1px 1px #000;box-shadow:inset 0 1px #ffffff12}#cq button:hover{background:#454d59}#cq button:focus-visible,#cq select:focus-visible,#cq summary:focus-visible{outline:2px solid #8ab4ff;outline-offset:1px}#cq button:active{transform:translateY(1px)}#cq button:disabled{opacity:.48;color:#c5c9cf;background:#24282f;cursor:default}#cq button[hidden]{display:none}.acts{display:flex;gap:6px;margin:8px 0 4px}.acts button{flex:1}#cq #join{background:#245c43;border-color:#3f9b70}#cq #join:hover{background:#2c6e51}.energySummary{font-size:11px;color:var(--mute);margin:2px 0 4px}.list{margin:0;padding:0;list-style:none;max-height:172px;overflow:auto}.list li{display:grid;grid-template-columns:20px 1fr auto;grid-template-areas:'n name eta' '. tag tag';column-gap:6px;padding:5px 2px;border-top:1px solid #292d34}.list li>span:first-child{grid-area:n;color:var(--mute);font-variant-numeric:tabular-nums}.list li b{grid-area:name;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.list li .eta{grid-area:eta;font-size:11px;font-weight:800;color:#cbd1da}.list li:first-child .eta{color:var(--safe)}.list li.me{background:#2a2412;border-radius:4px}.list li.me .eta{color:var(--warn)}.tag{grid-area:tag;font-size:10px;color:#7fcfae}.meta,.msg{font-size:11px;color:var(--mute);margin-top:6px}.msg{color:var(--warn)}.msg:empty{display:none}.diag{font-size:10px;color:var(--mute);margin-top:6px;line-height:1.4}.admin{display:none;border-top:1px solid var(--line);margin-top:8px;padding-top:6px}.admin.on{display:block}.admin summary,.settings summary{cursor:pointer;font-weight:800;padding:8px 0;user-select:none;color:#cbd1da}.admin .row,.settings .row{display:flex;gap:6px;margin-top:6px}.admin select{min-width:0;flex:1;min-height:40px;background:#0d0f12;color:#ddd;border:1px solid #363b44;border-radius:6px;padding:4px;font-size:12px}.lead{font-size:11px;color:var(--warn);margin-top:6px}.settings{border-top:1px solid var(--line);margin-top:8px;padding-top:2px}.settings label{display:flex;align-items:center;gap:6px;margin-top:6px;font-size:12px;color:#c3c9d3}.settings input[type=checkbox]{width:18px;height:18px}.sound.on{background:#245c43!important;border-color:#3f9b70!important}.steal{background:#7d1f27!important;border-color:#c6424d!important;color:#fff!important}@media(max-width:430px){#cq .panel{width:min(320px,calc(100vw - 16px))}.admin .row{flex-wrap:wrap}.admin .row select{flex:1 1 100%;font-size:16px}#cq button{min-height:44px}.key input{font-size:16px;min-height:44px;box-sizing:border-box}.tm{font-size:52px}}.admins{display:none;border-top:1px solid var(--line);margin-top:8px;padding-top:2px}.admins summary{cursor:pointer;font-weight:800;padding:8px 0;user-select:none;color:#cbd1da}.admlist{list-style:none;margin:0;padding:0}.admlist li{display:flex;align-items:center;gap:6px;padding:3px 0;border-top:1px solid #292d34}.admlist li b{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#cq .admlist button{min-height:32px;padding:2px 10px}.admins .row{display:flex;gap:6px;margin-top:6px}.admins input,.admins select{min-width:0;flex:1;min-height:40px;background:#0d0f12;color:#ddd;border:1px solid #363b44;border-radius:6px;padding:4px 6px;font-size:12px}@media(max-width:430px){.admins input,.admins select{font-size:16px}}#cq [hidden]{display:none!important}.claim{margin-top:8px}#cq #claim{width:100%;min-height:48px;background:#a72d35;border-color:#ff7a82;font-size:15px}#cq #claim:hover{background:#bf3640}#cq .round{font-size:13px;font-weight:900;color:var(--warn);margin-top:4px}#cq .roundctl{display:flex;gap:6px;align-items:center;margin-top:8px}#cq .roundctl b{font-size:11px;color:var(--mute)}#cq .roundctl select,#cq .roundctl input{min-width:0;flex:1;min-height:40px;background:#0d0f12;color:#ddd;border:1px solid #363b44;border-radius:6px;padding:4px 6px;font-size:12px}#cq .roundctl input{flex:0 0 56px}@media(max-width:430px){#cq .roundctl select,#cq .roundctl input{font-size:16px}}#cq .ldnote{font-size:12px;font-weight:700;color:#ffe3a0;margin-top:6px;text-align:center;overflow-wrap:anywhere}#cq .autoctl{margin-top:8px;font-size:12px;color:#c3c9d3}#cq .autoctl label{display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin-top:4px}#cq .autoctl input[type=checkbox]{width:18px;height:18px}#cq .autoctl input[type=number]{width:64px;min-height:36px;background:#0d0f12;color:#ddd;border:1px solid #363b44;border-radius:6px;padding:2px 6px;font-size:12px}@media(max-width:430px){#cq .autoctl input[type=number]{font-size:16px}}#cq .claimhelp{font-size:11px;color:var(--mute);margin-top:4px}#cq .claimby{font-weight:900;color:#fff;background:#3a1418;border:1px solid #c6424d;border-radius:6px;padding:10px 8px;font-size:14px}#cqbar{position:fixed;top:0;left:0;right:0;z-index:999998;padding:5px 10px;font:800 12px Arial,sans-serif;text-align:center;color:#111;background:#ffc857;box-shadow:0 2px 8px #0008;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#cqbar[data-mode=real]{background:#a72d35;color:#fff}#cqbar[data-mode=turtle]{background:#6fb3ff;color:#0b1a2b}#cqbar[hidden]{display:none}.phasectl{border-top:1px solid #292d34;margin-top:8px;padding-top:4px}.phasectl b{font-size:11px;color:var(--mute)}#cq .scrim,.phline{display:none}
.phline{font-size:12px;font-weight:800;color:#cbd1da;margin-top:6px;text-align:center}
@media(max-width:480px){#cq.open{left:0!important;right:0!important;top:auto!important;bottom:0!important}
#cq.open .scrim{display:block;position:fixed;inset:0;background:#0007}
#cq .panel{position:relative;z-index:1;width:100%;max-width:none;max-height:min(82vh,calc(100dvh - 16px));border-radius:16px 16px 0 0;border-width:1px 0 0;padding-bottom:env(safe-area-inset-bottom,0px)}
#cq h3{min-height:48px;padding-top:12px}
#cq h3::before{content:"";position:absolute;top:5px;left:50%;width:40px;height:4px;margin-left:-20px;border-radius:2px;background:#4a505b}
#cq h3 .compactBtn{display:none}
#cq h3 .min{width:44px;height:44px;font-size:20px}
#cq .admlist button{min-height:44px}
.phline{display:block}
#cqbar{top:auto;bottom:calc(env(safe-area-inset-bottom,0px) + 8px);left:8px;right:8px;padding:3px 8px;font-size:11px;border-radius:8px;pointer-events:none;opacity:.94}
}
@media(prefers-reduced-motion:reduce){#cq button:active{transform:none}}`
const phone=()=>matchMedia("(max-width:480px)").matches;
function inset(){let p=document.createElement("div");p.style.cssText="position:fixed;visibility:hidden;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)";document.documentElement.appendChild(p);let c=getComputedStyle(p),o={t:parseFloat(c.paddingTop)||0,r:parseFloat(c.paddingRight)||0,b:parseFloat(c.paddingBottom)||0,l:parseFloat(c.paddingLeft)||0};p.remove();return o}
// Desktop keeps the saved x/y. On phones the collapsed pill docks to the left or right edge (the saved side) at the saved height,
// inside the safe area; with nothing saved it sits on the right edge above Torn's bottom bar.
function place(d){let p;try{p=JSON.parse(localStorage.getItem(PS)||"null")}catch{};let s=d.style;if(!phone()){if(p){s.left=Math.max(0,Math.min(innerWidth-44,p.x))+"px";s.top=Math.max(0,Math.min(innerHeight-44,p.y))+"px";s.right="auto";s.bottom="auto"}else{s.left="auto";s.top="auto";s.right="12px";s.bottom="12px"}return}
let n=inset(),pad=8,side=p?.side==="l"?"l":"r";s.left=side==="l"?n.l+pad+"px":"auto";s.right=side==="r"?n.r+pad+"px":"auto";if(p){s.top=Math.max(n.t+pad,Math.min(innerHeight-(d.offsetHeight||44)-n.b-pad,p.y))+"px";s.bottom="auto"}else{s.top="auto";s.bottom=n.b+84+"px"}}
function closeCq(d){d.classList.remove("open");d.classList.remove("compact");let pn=d.querySelector(".panel");if(pn)pn.style.transform="";place(d)}
// Phone sheet: swipe down on the header to dismiss.
function swipeClose(d,h){let y0=null,dy=0;h.addEventListener("touchstart",e=>{if(!phone()||!d.classList.contains("open"))return;y0=e.touches[0].clientY;dy=0},{passive:true});h.addEventListener("touchmove",e=>{if(y0==null)return;dy=Math.max(0,e.touches[0].clientY-y0);d.querySelector(".panel").style.transform="translateY("+dy+"px)"},{passive:true});h.addEventListener("touchend",()=>{if(y0==null)return;y0=null;if(dy>70)closeCq(d);else d.querySelector(".panel").style.transform=""})}
function drag(el,handle){let sx,sy,l,t,moved=false;const down=e=>{if(e.target.closest("input,button,.min"))return;if(phone()&&el.classList.contains("open"))return;if(e.button!=null&&e.button!==0)return;sx=e.clientX??e.touches?.[0]?.clientX;sy=e.clientY??e.touches?.[0]?.clientY;let r=el.getBoundingClientRect();l=r.left;t=r.top;moved=false;document.addEventListener("mousemove",move);document.addEventListener("mouseup",up);document.addEventListener("touchmove",move,{passive:false});document.addEventListener("touchend",up)};const move=e=>{let x=e.clientX??e.touches?.[0]?.clientX,y=e.clientY??e.touches?.[0]?.clientY;if(x==null)return;e.preventDefault();if(Math.abs(x-sx)+Math.abs(y-sy)>5)moved=true;el.style.right="auto";el.style.bottom="auto";el.style.left=Math.max(0,Math.min(innerWidth-el.offsetWidth,l+x-sx))+"px";el.style.top=Math.max(0,Math.min(innerHeight-el.offsetHeight,t+y-sy))+"px"};const up=()=>{document.removeEventListener("mousemove",move);document.removeEventListener("mouseup",up);document.removeEventListener("touchmove",move);document.removeEventListener("touchend",up);let r=el.getBoundingClientRect();try{localStorage.setItem(PS,JSON.stringify({x:r.left,y:r.top,side:r.left+r.width/2>innerWidth/2?"r":"l"}))}catch{}if(phone()&&!el.classList.contains("open"))place(el);setTimeout(()=>moved=false,50)};handle.addEventListener("mousedown",down);handle.addEventListener("touchstart",down,{passive:true});return()=>moved}
function clampOpen(d){let r=d.getBoundingClientRect(),pad=6,x=Math.max(pad,Math.min(innerWidth-r.width-pad,r.left)),y=Math.max(pad,Math.min(innerHeight-r.height-pad,r.top));d.style.right="auto";d.style.bottom="auto";d.style.left=x+"px";d.style.top=y+"px"}
function mount(){if(document.querySelector("#cq"))return;let d=document.createElement("div");d.id="cq";d.innerHTML=`<style>${css}</style><div class="bubble" title="Chain Queue"><span class="bi">🔗</span></div><div class="scrim"></div><div class="panel"><h3><span class="ttl">CLOUDY'S CHAIN MANAGER</span><span id="st">SETUP</span><span class="compactBtn" title="Small window">▣</span><span class="min" title="Minimize">−</span></h3><div class="b"><div class="hero"><div class="hrow"><span class="state">—</span><span class="chain">—</span></div><div class="tm">--:--</div><div class="src"></div><div class="call">Connect API</div><div class="nx">Nobody queued</div><div class="round" hidden></div><div class="claim" hidden><button id="claim">✋ Got it – I'm hitting</button><div class="claimhelp">Tap this BEFORE you hit, so nobody else does.</div><div class="claimby" role="status"></div></div><div class="compactRoster"></div></div><div class="phline" hidden></div><div class="ldnote" hidden></div><div class="acts"><button id="join" disabled>Join</button><button id="roundpass" hidden>Pass round</button><button id="leave" disabled>Leave</button><button id="energy">⚡ Energy</button></div><div class="energySummary" style="display:none"></div><ol class="list"></ol><div class="lead"></div><div class="sessionCtl" style="display:none;gap:4px;margin-top:6px"><button id="startsession">▶ START SESSION</button><button id="endsession">■ END SESSION</button></div><details class="admins"><summary>🛡 SESSION ADMINS</summary><ul class="admlist"></ul><div class="row"><input id="admid" inputmode="numeric" placeholder="Torn ID" aria-label="Torn player ID"><select id="admrole" aria-label="Role"><option>leader</option><option>officer</option><option selected>watcher</option></select><button id="admadd">Add</button></div><div class="row roundctl" hidden><b>QUEUE</b><select id="qmode" aria-label="Queue mode"><option value="normal">One hit a turn</option><option value="round">Rounds (buddy/dump)</option></select><input id="qsize" type="number" min="1" max="25" aria-label="Hits per round"><button id="qset">Set</button></div><div class="autoctl" hidden><label><input id="autostart" type="checkbox"> Start sessions automatically in ranked wars</label><label>…or when the chain reaches <input id="autochain" type="number" min="0" max="5000" aria-label="Chain length that starts a session (0 is off)"> (0 = off)</label></div><div class="phasectl"><b>PHASE BANNER</b><div class="row"><select id="phmode" aria-label="War mode"><option value="">Off</option><option value="real">Real fight</option><option value="termed">Termed</option><option value="turtle">Turtle</option></select><button id="phset">Set</button></div><div class="row"><input id="phtext" maxlength="80" placeholder="Phase, e.g. Buddy rounds of 10" aria-label="Phase text"></div><div class="row notectl" hidden><input id="ldnote" maxlength="140" placeholder="Leaders' note (140 characters)" aria-label="Leaders' note"><button id="ldset">Set note</button></div></div><div class="meta">Admins can start and end sessions and set the phase banner.</div></details><details class="admin"><summary>👑 LEADER CONTROLS</summary><div class="row"><select id="tempo"><option value="60">1:00</option><option value="90">1:30</option><option value="120">2:00</option><option value="150">2:30</option><option value="180">3:00</option><option value="210">3:30</option><option value="240">4:00</option><option value="270">4:30</option><option value="300">5:00</option></select><button id="hitnow">HIT NOW</button><button id="pause">Pause</button></div><div class="row"><select id="target"></select><button id="skip">Skip</button><button id="remove">Remove</button><button id="pass">Pass Lead</button></div></details><details class="settings"><summary>⚙ Settings</summary><div class="key"><input id="ck" type="password" placeholder="Limited API key"><button id="con">Connect</button></div><div class="row"><button id="sound" class="sound">🔊 Sounds: ON</button></div><label><input id="tcmfeed" type="checkbox"> Faster timer from TCM (optional)</label><div class="row"><button id="takelead" class="steal">⚠ STEAL LEAD</button></div><div class="meta">Emergency override only if the leader is AFK or disconnected.</div><div class="meta version"></div><div class="diag"></div></details><div class="msg"></div></div></div>`;document.body.appendChild(d);place(d);cq("#ck").value=storeGet(KS)||"";cq("#st").textContent=storeGet(KS)?"CONNECTING":"SETUP";setSoundButton();let wasDrag=drag(d,$("#cq .bubble"));drag(d,$("#cq h3"));$("#cq .bubble").onclick=()=>{if(!wasDrag()){d.classList.add("open");requestAnimationFrame(()=>clampOpen(d));if(!activeLoop)setTimeout(checkForActiveSession,0)}};$("#cq .min").onclick=e=>{e.stopPropagation();closeCq(d)};$("#cq .scrim").onclick=()=>closeCq(d);swipeClose(d,$("#cq h3"));addEventListener("resize",()=>{if(!d.classList.contains("open"))place(d)});$("#cq .compactBtn").onclick=e=>{e.stopPropagation();d.classList.toggle("compact");requestAnimationFrame(()=>clampOpen(d))};cq("#con").onclick=connect;cq("#join").onclick=join;cq("#leave").onclick=leave;cq("#tempo").onchange=tempo;cq("#hitnow").onclick=manualHit;cq("#pause").onclick=togglePause;cq("#skip").onclick=skip;cq("#remove").onclick=removeTarget;cq("#pass").onclick=passLead;cq("#takelead").onclick=takeLead;cq("#startsession").onclick=()=>setSessionActive(true);cq("#endsession").onclick=()=>setSessionActive(false);cq("#sound").onclick=toggleSound;cq("#tcmfeed").onchange=toggleFeed;cq("#admadd").onclick=addAdmin;cq("#claim").onclick=claimSave;cq(".admlist").onclick=e=>{let b=e.target.closest("[data-rm]");if(b)removeAdmin(+b.dataset.rm)};cq(".admins").ontoggle=e=>{if(e.target.open)loadAdmins()};cq("#phset").onclick=setPhase;cq("#qset").onclick=setQueueMode;cq("#roundpass").onclick=passRound;cq(".roundctl").oninput=e=>{e.currentTarget.dataset.dirty="1"};cq("#ldset").onclick=setNote;cq("#autostart").onchange=setAutoStart;cq("#autochain").oninput=e=>{cq(".autoctl").dataset.dirty="1"};cq("#autochain").onchange=setAutoStart;cq(".phasectl").oninput=e=>{e.currentTarget.dataset.dirty="1"};cq("#energy").onclick=()=>{let e=$("#cq .energySummary");e.style.display=e.style.display==="none"?"block":"none";render()};render()}
function safeText(sel,v){let e=cq(sel);if(e)e.textContent=v==null?"":String(v)}function safeHTML(sel,v){let e=cq(sel);if(e)e.innerHTML=v==null?"":String(v)}function paintDiag(){let ve=cq(".version");if(ve){ve.textContent="Version: v"+VERSION+(versionState.blocked?" • UPDATE REQUIRED → v"+versionState.latest:versionState.update?" • UPDATE AVAILABLE → v"+versionState.latest:" • CURRENT");ve.style.color=versionState.blocked?"#ff5b5b":versionState.update?"#ffd166":""}let e=cq(".diag");if(e)e.textContent=["QUEUE "+(diag.queue?"✓":"×"),"ID "+(diag.id?"✓":"×"),"KEY "+(diag.key?"✓":"×"),"TORN "+(diag.torn?"✓":"×"),"ENERGY "+(diag.energy?"✓":"×")].join("  ")+(diag.last?" • "+diag.last:"")}function soundOn(){return storeGet(SS)!=="0"}function unlockAudio(){try{audioCtx=audioCtx||new (window.AudioContext||window.webkitAudioContext)();if(audioCtx.state==="suspended")audioCtx.resume()}catch{}}document.addEventListener("pointerdown",()=>{if(soundOn())unlockAudio()},{passive:true});
function setSoundButton(){let b=cq("#sound");if(!b)return;b.textContent=soundOn()?"🔊 Sounds: ON":"🔇 Sounds: OFF";b.classList.toggle("on",soundOn())}addEventListener("storage",e=>{if(e.key===SS)setSoundButton()});function toggleSound(){storeSet(SS,soundOn()?"0":"1");setSoundButton();if(soundOn()){unlockAudio();tone("hit")}}// One instance per player across tabs. Polling already has one owner per player (Web Locks, or a localStorage lease where
// they are missing). Sounds work the same way: each tab announces whether it is visible and whether it owns polling, every
// tab ranks the live tabs the same way (visible first, then the poller, then the lowest tab id), and only the best one
// plays. An event id remembered in localStorage for CQ_SND_MS stops a second play if two tabs briefly disagree. A tab with
// no peers (TornPDA's single webview, or one open tab) plays at once, with no delay. BroadcastChannel carries the
// announcements; the storage event does where it is missing.
const CQ_PEER_MS=6000,CQ_SND_MS=10000,cqPeers=new Map(),cqBC=typeof BroadcastChannel==="function"?new BroadcastChannel("cq-tabs"):null;
function cqRank(){let vis=document.visibilityState==="visible";return[vis&&document.hasFocus()?0:vis?1:2,cqTabOwner?0:1,cqTabId]}
function cqSend(t){if(!me)return;let m={t,tab:cqTabId,pid:me.id,r:cqRank()};try{if(cqBC)cqBC.postMessage(m);else localStorage.setItem("cq:tabs:msg",JSON.stringify({...m,n:Math.random()}))}catch{}}
function cqHear(m){if(!m||m.tab===cqTabId||!me||m.pid!==me.id)return;if(m.t==="bye")cqPeers.delete(m.tab);else cqPeers.set(m.tab,{r:m.r,at:Date.now()})}
if(cqBC)cqBC.onmessage=e=>cqHear(e.data);else addEventListener("storage",e=>{if(e.key==="cq:tabs:msg")try{cqHear(JSON.parse(e.newValue))}catch{}});
setInterval(()=>cqSend("hi"),2000);document.addEventListener("visibilitychange",()=>cqSend("hi"));addEventListener("focus",()=>cqSend("hi"));addEventListener("blur",()=>cqSend("hi"));addEventListener("pagehide",()=>cqSend("bye"));
function cqBetter(a,b){for(let i=0;i<3;i++)if(a[i]!==b[i])return a[i]<b[i];return false}
function cqMayPlay(id){if(!me||!id)return true;let mine=cqRank(),now=Date.now();for(const[t,p]of cqPeers){if(now-p.at>CQ_PEER_MS)cqPeers.delete(t);else if(cqBetter(p.r,mine))return false}let key="cq:snd:"+me.id,seen={};try{seen=JSON.parse(localStorage.getItem(key)||"{}")}catch{}for(const k in seen)if(now-seen[k]>CQ_SND_MS)delete seen[k];if(seen[id])return false;seen[id]=now;try{localStorage.setItem(key,JSON.stringify(seen))}catch{}return true}
function tone(kind,id){if(!soundOn()||!cqMayPlay(id))return;try{unlockAudio();if(!audioCtx||audioCtx.state!=="running")return;let now=audioCtx.currentTime,notes=kind==="urgent"?[880,440,880,440,1040,1040]:kind==="turn"?[660,880,1040]:[520,700],step=kind==="urgent"?.17:.11;notes.forEach((f,i)=>{let o=audioCtx.createOscillator(),g=audioCtx.createGain();o.frequency.value=f;g.gain.setValueAtTime(.0001,now+i*step);g.gain.exponentialRampToValueAtTime(kind==="urgent"?.22:.12,now+i*step+.015);g.gain.exponentialRampToValueAtTime(.0001,now+i*step+step-.01);o.connect(g);g.connect(audioCtx.destination);o.start(now+i*step);o.stop(now+(i+1)*step)})}catch{}}
let cqAlertTurn=null,cqAlertUrgentAt=0;
function cqAlertTick(){
 if(!activeLoop||!session.active||!me||!soundOn()||session.paused){cqAlertTurn=null;return}
 const n=q[0],mine=+n?.player_id===me.id,trigger=+session.trigger_seconds||240;
 if(!mine||count<=0||!Number.isFinite(secs)||secs<=0){cqAlertTurn=null;return}
 const identity=String(S)+":"+String(n.player_id)+":"+String(n.joined_at||"");
 if(cqAlertTurn!==identity){cqAlertTurn=identity;cqAlertUrgentAt=0;tone("turn","turn:"+identity)}
 if(secs<=trigger&&Date.now()-cqAlertUrgentAt>=30000){
   const now=Date.now();
   tone("urgent","urgent:"+identity+":"+Math.floor(now/30000));
   cqAlertUrgentAt=now
 }
}function msg(x){diag.last=x||"";let e=cq(".msg");if(e)e.textContent=x||"";paintDiag()}
async function request(url,opt={}){
 let method=(opt.method||"GET").toUpperCase(),headers=opt.headers||{},body=opt.body;
 const parse=r=>{
   let status=+(r?.status??r?.statusCode??200),raw=r?.responseText??r?.response??r?.body??r?.data??r?.result??r;
   let j=raw;
   if(typeof raw==="string"){try{j=raw?JSON.parse(raw):null}catch{}}
   if(status<200||status>=300){let e=Error(j?.error?.error||j?.error?.message||j?.message||"HTTP "+status);e.code=String(j?.error?.code??j?.code??status);e.status=status;throw e}
   return j
 };
 if(typeof PDA_httpGet==="function"&&typeof PDA_httpPost==="function"){
   try{
     let r=method==="GET"?await PDA_httpGet(url,headers):method==="POST"?await PDA_httpPost(url,headers,body||""):null;
     if(r!==null)return parse(r)
   }catch(e){throw Error("PDA "+method+" failed: "+(e?.message||e))}
 }
 return new Promise((resolve,reject)=>GM_xmlhttpRequest({method,url,headers,data:body,onload:r=>{try{resolve(parse(r))}catch(e){reject(e)}},onerror:()=>reject(Error("Network request failed"))}))
}
// Shared Torn API request scheduler: coalesce identical in-flight reads and back off on rate limits.
const tornInFlight=new Map(),tornBackoff=new Map();
function tornCooldown(p){return Math.max(tornBackoff.get("*")?.until||0,tornBackoff.get(p)?.until||0)-Date.now()}
// Prefer the browser's atomic Web Locks election. Older browsers/PDA fall back to a lease.
const cqTabId=String(Date.now())+"-"+Math.random().toString(36).slice(2);
let cqTabOwner=false,cqTabLeaseTimer=null,cqLockPending=false,cqLockRelease=null,cqLockGeneration=0;
const cqWebLocks=!!(navigator.locks&&typeof navigator.locks.request==="function");
function cqLeaseKey(){return "cq:poller:"+String(me?.id||"pending")+":"+String(S)}
function cqReadLease(){try{return JSON.parse(localStorage.getItem(cqLeaseKey())||"null")}catch{return null}}
function cqOwnPoller(){return cqTabOwner&&(cqWebLocks||cqReadLease()?.id===cqTabId)}
function cqActivatePoller(){if(cqOwnPoller()&&activeLoop&&!window.__cqFast)window.__cqFast=setTimeout(pollFast,0)}
function cqLosePoller(){cqTabOwner=false;clearTimeout(window.__cqFast);window.__cqFast=null}
function cqLeaseTick(){
 if(!activeLoop||!me||S==="pending"||!session.active)return;
 if(cqWebLocks){
   if(cqTabOwner||cqLockPending)return;
   cqLockPending=true;
   const generation=cqLockGeneration;
   navigator.locks.request(cqLeaseKey(),{mode:"exclusive",ifAvailable:true},async lock=>{
     cqLockPending=false;
     if(!lock||generation!==cqLockGeneration||!activeLoop||!session.active)return;
     cqTabOwner=true;cqActivatePoller();
     try{await new Promise(resolve=>{cqLockRelease=resolve})}
     finally{cqLockRelease=null;cqLosePoller()}
   }).catch(e=>{cqLockPending=false;diag.last="Tab lock: "+(e?.message||"failed");paintDiag()});
   return;
 }
 const now=Date.now(),old=cqReadLease();
 if(old?.id===cqTabId||!old||old.until<now){
   try{localStorage.setItem(cqLeaseKey(),JSON.stringify({id:cqTabId,until:now+9000}));cqTabOwner=cqReadLease()?.id===cqTabId}catch{cqTabOwner=false}
 }else cqTabOwner=false;
 if(!cqTabOwner){clearTimeout(window.__cqFast);window.__cqFast=null}
 cqActivatePoller();
}
function cqStartLease(){if(cqTabLeaseTimer)return;cqLeaseTick();cqTabLeaseTimer=setInterval(cqLeaseTick,2000)}
function cqStopLease(){
 clearInterval(cqTabLeaseTimer);cqTabLeaseTimer=null;
 cqLockGeneration++;
 if(cqLockRelease)cqLockRelease();
 if(!cqWebLocks&&cqOwnPoller())try{localStorage.removeItem(cqLeaseKey())}catch{}
 cqLosePoller();
}
window.addEventListener("pagehide",cqStopLease);
window.addEventListener("pageshow",()=>{if(activeLoop&&session.active)cqStartLease()});
window.addEventListener("storage",e=>{if(!cqWebLocks&&e.key===cqLeaseKey())cqLeaseTick()});
async function torn(p){if(tornInFlight.has(p))return tornInFlight.get(p);if(tornCooldown(p)>0){let e=Error("Torn API cooling down after rate limit");e.code="5";e.endpoint=p;e.cooldown=true;throw e}const pending=(async()=>{let pk=PDAK!=="###PDA-APIKEY###"?PDAK:"",k=pk||storeGet(KS);diag.key=!!k;if(!k)throw Error("Enter a Limited API key");let j=await request(A+p,{headers:{Authorization:"ApiKey "+k}});if(j==null)throw Error("Empty Torn API response: "+p);if(typeof j==="string")throw Error("Unexpected Torn response: "+j.slice(0,80));if(j?.error){let e=Error(j.error?.error||j.error?.message||"Torn API error");e.code=String(j.error?.code??"");e.endpoint=p;if(e.code==="5"){const prior=tornBackoff.get("*")?.failures||0;const failures=Math.min(prior+1,6);tornBackoff.set("*",{failures,until:Date.now()+Math.min(120000,5000*2**(failures-1))+Math.floor(Math.random()*1000)})}throw e}tornBackoff.delete("*");tornBackoff.delete(p);return j})();tornInFlight.set(p,pending);try{return await pending}finally{tornInFlight.delete(p)}}
async function db(path,opt={}){return request(U+"/rest/v1/"+path,{method:opt.method||"GET",headers:{apikey:K,Authorization:"Bearer "+K,"Content-Type":"application/json",Prefer:opt.prefer||"return=minimal",...(opt.headers||{})},body:opt.body})}async function rpc(fn,p){return db("rpc/"+fn,{method:"POST",body:JSON.stringify(p),prefer:"return=representation"})}
function errCode(e){let m=String(e?.message||"");return String(e?.code||(/incorrect id[- ]entity relation/i.test(m)?"7":/too many requests/i.test(m)?"429":""))}
async function reportError(context,e,endpoint=""){if(e?.cooldown)return;try{let code=errCode(e),message=String(e?.message||e||"Unknown error").slice(0,240),sig=context+"|"+code+"|"+message,now=Date.now();if(now-(errorSent.get(sig)||0)<60000)return;errorSent.set(sig,now);await rpc("chain_report_error",{p_session:S,p_player_id:me?.id||null,p_version:VERSION,p_context:context,p_code:code||null,p_message:message,p_endpoint:endpoint||e?.endpoint||null,p_platform:typeof PDA_httpGet==="function"?"PDA":"Userscript"})}catch{}}
function factionPermissionError(e){return errCode(e)==="7"||/incorrect id[- ]entity relation/i.test(String(e?.message||""))}
async function selectFactionSession(){let j=await torn("/user/faction"),f=j?.faction??j, fid=+(f?.id??f?.faction_id??j?.faction_id??0);if(!fid)throw Error("Could not identify your Torn faction");factionId=fid;let s=await rpc("chain_open_faction",{p_faction_id:fid});if(!s)throw Error("Faction "+fid+" is not licensed for Cloudy's Chain Manager. Contact CloudyMuffin440 [4315564] on Torn.");S=String(s);session={session_id:S,active:false,leader_id:null,leader_name:null,trigger_seconds:240,paused:false,manual_hit_player_id:null,manual_hit_at:null,leader_heartbeat_at:null,chain_timer_seconds:null,chain_timer_synced_at:null,chain_count:0,chain_end_at:null,chain_max:0,chain_torn_timestamp:null,chain_cooldown_at:null};q=[];return fid}
async function probeFactionApi(){try{await torn("/faction/attacks?limit=1&sort=DESC");canLead=true;return true}catch(e){if(factionPermissionError(e)){canLead=false;await reportError("Faction API permission",e,"/faction/attacks");return false}await reportError("Faction API probe",e,"/faction/attacks");return true}}
async function syncTornClock(){let sent=Date.now(),j=await torn("/faction/timestamp"),recv=Date.now(),v=j.timestamp??j.time??j.server_time??j;let ts=typeof v==="object"?(v.timestamp??v.time??v.server_time):v;ts=+ts;if(!Number.isFinite(ts)||ts<=0)throw Error("Invalid Torn timestamp");if(ts<1e12)ts*=1000;tornClockOffset=ts-((sent+recv)/2);lastTornClockSync=recv;return tornClockOffset}
function tornNow(){let w=typeof unsafeWindow!=="undefined"?unsafeWindow:window;try{if(typeof w.getCurrentTimestamp==="function"){let v=+w.getCurrentTimestamp();if(Number.isFinite(v)&&v>0)return v<1e12?v*1000:v}}catch{}return Date.now()+tornClockOffset}
function localClock(){let snap=+session.chain_torn_timestamp||0;if(optimisticEndAt&&snap>optimisticSnapshotTs){optimisticEndAt=0;optimisticSnapshotTs=0}count=+session.chain_count||0;if(optimisticEndAt&&snap<=optimisticSnapshotTs){secs=Math.max(0,Math.ceil((optimisticEndAt-tornNow())/1000));return}let end=+session.chain_end_at||0;if(feedUsed()){end=feed.end;count=feed.current}if(count<=0||end<=0){secs=null;return}secs=Math.ceil((end*1000-tornNow())/1000)}
async function syncChainSnapshot(){let sent=Date.now(),j=await torn("/faction?selections=chain,timestamp"),recv=Date.now(),c=j.chain||{},ts=+(j.timestamp??0),ct=+(c.current??0),cm=+(c.max??c.maximum??0),end=+(c.end??0),cool=+(c.cooldown??0);if(!Number.isFinite(ts)||ts<=0)throw Error("Invalid Torn chain timestamp");if(!Number.isFinite(ct)||ct<0||!Number.isFinite(cm)||cm<0||!Number.isFinite(end)||end<0||!Number.isFinite(cool)||cool<0)throw Error("Invalid Torn chain snapshot");let tms=ts<1e12?ts*1000:ts;tornClockOffset=tms-((sent+recv)/2);lastTornClockSync=recv;lastChainSnapshotPoll=recv;let applied=await rpc("chain_apply_snapshot",{p_session:S,p_torn_timestamp:Math.floor(tms/1000),p_current:ct,p_max:cm,p_end:end,p_cooldown:cool});session.chain_torn_timestamp=Math.floor(tms/1000);session.chain_count=ct;session.chain_max=cm;session.chain_end_at=end;session.chain_cooldown_at=cool;session.chain_timer_seconds=ct>0&&end>0?Math.max(0,Math.min(600,end-Math.floor(tms/1000))):0;session.chain_timer_synced_at=new Date().toISOString();localClock();render();return {timestamp:Math.floor(tms/1000),current:ct,max:cm,end,cooldown:cool,applied}}
async function load(){
 const serial=++rtLoadSerial,revision=rtStateRevision,scope=S;
 const getRows=async path=>{
  let r=await db(path,{method:"GET"});
  if(r===undefined){
   await new Promise(ok=>setTimeout(ok,250));
   r=await db(path,{method:"GET"});
  }
  return r;
 };
 try{
  const nq=await getRows("chain_queue?session_id=eq."+encodeURIComponent(S)+"&select=*&order=position.asc,joined_at.asc");
  if(!Array.isArray(nq))throw Error("Invalid queue response");
  const ns=await getRows("chain_sessions?session_id=eq."+encodeURIComponent(S)+"&select=*");
  if(!Array.isArray(ns)||ns.length!==1)throw Error("Invalid or missing session response");
  // Ignore older requests and snapshots overtaken by Realtime events.
  if(serial!==rtLoadSerial||revision!==rtStateRevision||scope!==S)return false;
  q=nq;session=ns[0];
  lastSharedLoad=Date.now();diag.queue=true;
  if(activeLoop&&session.active===false){stopActiveLoop();return true}
  localClock();render();return true;
 }catch(e){
  if(serial!==rtLoadSerial||scope!==S)return false;
  diag.queue=false;diag.last="Queue sync: "+(e?.message||"failed");
  msg("Queue sync failed — retaining last confirmed data");
  localClock();render();return false;
 }
}
async function checkVersion(){try{let r=await db("chain_client_config?config_id=eq.main&select=latest_version,minimum_version",{method:"GET"});if(Array.isArray(r)&&r[0]){versionState.latest=String(r[0].latest_version||VERSION);versionState.minimum=String(r[0].minimum_version||VERSION);versionState.blocked=vercmp(VERSION,versionState.minimum)<0;versionState.update=vercmp(VERSION,versionState.latest)<0;versionState.checked=true}else versionState.checked=false}catch(e){versionState.checked=false;versionState.blocked=false}render();return !versionState.blocked}
function versionGuard(){if(!versionState.blocked)return true;msg("UPDATE REQUIRED — v"+VERSION+" is below minimum v"+versionState.minimum);alert("Cloudy\'s Chain Manager v"+VERSION+" is no longer supported. Update to v"+versionState.latest+" before using the queue.");return false}
async function control(action,value=null){if(!leader())return false;let r=await rpc("chain_session_control",{p_session:S,p_leader_id:me.id,p_action:action,p_value:value==null?null:String(value)});if(!rtJoined)await load();return r}
function leader(){return !!me&&+session.leader_id===me.id}
function rtStop(){
 rtJoinRef=null;rtJoinTopic=null;
 clearTimeout(window.__cqRtReconnect);window.__cqRtReconnect=null;
 clearInterval(rtHeartbeat);rtHeartbeat=null;rtJoined=false;rtReconnectAttempt=0;
 const socket=rtSocket;rtSocket=null;
 if(socket){try{socket.onclose=null;socket.close()}catch{}}
}
function scheduleRealtimeReconnect(){
 if(!activeLoop||!session.active||S==="pending")return;
 clearTimeout(window.__cqRtReconnect);
 const base=Math.min(60000,2000*Math.pow(2,Math.min(rtReconnectAttempt,5)));
 const delay=Math.round(base*(0.8+Math.random()*0.4));
 rtReconnectAttempt++;
 window.__cqRtReconnect=setTimeout(()=>{
  window.__cqRtReconnect=null;
  if(!rtSocket&&activeLoop&&session.active)startRealtime();
 },delay);
}
function rtSend(topic,event,payload){if(rtSocket&&rtSocket.readyState===1)try{let ref=String(++rtRef),m={topic,event,payload,ref};if(event==="phx_join"){m.join_ref=ref;rtJoinRef=ref;rtJoinTopic=topic}rtSocket.send(JSON.stringify(m));return ref}catch{}return null}
function rtApplyQueue(d){let typ=String(d?.type||d?.eventType||"").toUpperCase(),r=d?.record||d?.new||{},o=d?.old_record||d?.old||{},sid=String(r.session_id||o.session_id||"");if(sid!==S)return;rtStateRevision++;let id=+(r.player_id||o.player_id||0);if(!id)return;if(typ==="DELETE")q=q.filter(x=>+x.player_id!==id);else{let i=q.findIndex(x=>+x.player_id===id);if(i>=0)q[i]={...q[i],...r};else q.push(r)}q.sort((a,b)=>(+a.position||999999)-(+b.position||999999)||String(a.joined_at||"").localeCompare(String(b.joined_at||"")));lastSharedLoad=Date.now();diag.queue=true;render()}
function rtApplySession(d){let r=d?.record||d?.new||{};if(String(r.session_id||"")!==S)return;rtStateRevision++;let wasLeader=leader();session={...session,...r};if(!wasLeader&&leader())lastChainSnapshotPoll=0;lastSharedLoad=Date.now();localClock();render();if(session.active===false)stopActiveLoop()}
function startRealtime(){
 if(rtSocket||!activeLoop||!session.active||S==="pending")return;
 try{
  const ws=U.replace(/^https:/,"wss:")+"/realtime/v1/websocket?apikey="+encodeURIComponent(K)+"&vsn=1.0.0";
  const topic="realtime:chain-manager:"+S;
  const socket=new WebSocket(ws);rtSocket=socket;rtJoined=false;rtJoinRef=null;rtJoinTopic=null;
  socket.onopen=()=>{
   if(rtSocket!==socket)return;
   rtSend(topic,"phx_join",{config:{broadcast:{ack:false,self:false},presence:{enabled:false},postgres_changes:[{event:"*",schema:"public",table:"chain_queue",filter:"session_id=eq."+S},{event:"UPDATE",schema:"public",table:"chain_sessions",filter:"session_id=eq."+S}]}});
   clearInterval(rtHeartbeat);rtHeartbeat=setInterval(()=>rtSend("phoenix","heartbeat",{}),25000);
  };
  socket.onmessage=e=>{
   if(rtSocket!==socket)return;
   try{
    const m=JSON.parse(e.data);
    if(m?.event==="phx_reply"){
     if(String(m.ref||"")!==String(rtJoinRef||"")||m.topic!==rtJoinTopic)return;
     if(m?.payload?.status==="ok"){
      const recovered=!rtJoined;
      rtJoined=true;rtReconnectAttempt=0;
      if(recovered)load().catch(err=>{diag.queue=false;msg("Realtime resync failed: "+(err?.message||"failed"))});
     }else{rtJoined=false;try{socket.close()}catch{}}
     return;
    }
    if(m?.event==="phx_error"){rtJoined=false;try{socket.close()}catch{};return}
    if(m?.event!=="postgres_changes")return;
    const d=m?.payload?.data||m?.payload||{};
    if(d.table==="chain_queue")rtApplyQueue(d);
    else if(d.table==="chain_sessions")rtApplySession(d);
   }catch{}
  };
  socket.onerror=()=>{if(rtSocket===socket)rtJoined=false};
  socket.onclose=()=>{
   if(rtSocket!==socket)return;
   rtJoined=false;rtJoinRef=null;rtJoinTopic=null;clearInterval(rtHeartbeat);rtHeartbeat=null;rtSocket=null;
   scheduleRealtimeReconnect();
  };
 }catch(e){rtJoined=false;rtSocket=null;scheduleRealtimeReconnect()}
}
function stopActiveLoop(){cqStopLease();activeLoop=false;clearTimeout(window.__cqFast);clearInterval(window.__cqClock);clearTimeout(window.__cqFeed);feed=null;rtStop();safeText("#st","IDLE");localClock();render();clearTimeout(window.__cqIdle);if(S!=="pending")window.__cqIdle=setTimeout(checkForActiveSession,300000)}
async function startActiveLoop(){if(activeLoop||!session.active)return;activeLoop=true;clearTimeout(window.__cqIdle);startRealtime();cqStartLease();if(cqOwnPoller())await probeFactionApi();if(cqOwnPoller())try{await syncTornClock()}catch(e){msg("Torn clock sync: "+(e?.message||"failed"))}if(cqOwnPoller()&&q.some(x=>+x.player_id===me?.id))try{await rpc("chain_capability",{p_session:S,p_player_id:me.id,p_can_lead:canLead});await load()}catch(e){await reportError("Capability sync",e,"chain_capability")}if(cqOwnPoller()&&leader())try{await syncChainSnapshot()}catch(e){await reportError("Chain snapshot",e,"/faction?selections=chain,timestamp");localClock()}clearTimeout(window.__cqFast);clearInterval(window.__cqClock);await pollFast();pollFeed();window.__cqClock=setInterval(()=>{localClock();render()},250)}
async function setSessionActive(on){if(!isAdmin())return msg("Only session admins can start or end the shared session");let ok=await rpc("chain_set_active",{p_session:S,p_player_id:me.id,p_active:!!on});if(!ok)return msg("Session change failed");await load();if(on){await startActiveLoop();msg("Chain Manager session STARTED")}else{stopActiveLoop();msg("Chain Manager session ENDED — clients sleeping")}}
async function checkForActiveSession(){clearTimeout(window.__cqIdle);if(activeLoop||S==="pending")return;try{let r=await db("chain_sessions?session_id=eq."+S+"&select=*",{method:"GET"});if(Array.isArray(r)&&r[0]&&"auto_start" in r[0])Object.assign(session,{auto_start:r[0].auto_start,auto_chain_min:r[0].auto_chain_min});if(Array.isArray(r)&&r[0]?.active){session.active=true;await load();await startActiveLoop();msg("Session is active — LIVE")}else if(Array.isArray(r)&&r[0])await maybeAutoStart()}catch{}finally{if(!activeLoop&&S!=="pending")window.__cqIdle=setTimeout(checkForActiveSession,300000)}}
function restoreIdentity(){try{let x=JSON.parse(storeGet("cq_identity","null"));if(x?.id){me={id:+x.id,name:x.name||"Player"};diag.id=true;return true}}catch{}diag.id=false;return false}
function target(){return +(cq("#target")?.value||0)}
async function tempo(){if(!leader())return;let v=+cq("#tempo").value;if(v<60||v>300||v%30)return;await control("tempo",v)}
async function manualHit(){if(!leader()||!q[0])return;await control("manual_hit");msg("HIT NOW sent to "+q[0].player_name)}
async function togglePause(){if(!leader())return;await control("toggle_pause")}
async function skip(){let id=target();if(!leader()||!id)return;if(!confirm("Skip this player to the bottom?"))return;await rpc("chain_skip",{p_session:S,p_leader_id:me.id,p_player_id:id});await load();msg("Player skipped")}
async function removeTarget(){let id=target();if(!leader()||!id)return;if(id===me.id){msg("Pass Chain Lead before removing yourself");alert("You are the Chain Leader. Pass lead to another queued player first.");return}if(!confirm("Remove this player from the chain queue?"))return;await rpc("chain_remove",{p_session:S,p_leader_id:me.id,p_player_id:id});await load();msg("Removed from queue")}
async function takeLead(){if(!versionGuard())return;if(!me||!q.some(x=>+x.player_id===me.id))return msg("Join the queue before taking lead");if(!canLead)return msg("Faction API permission required before taking Chain Lead");if(leader())return msg("You already have Chain Lead");if(!confirm("⚠ ARE YOU SURE YOU WANT TO STEAL LEAD?\n\nCurrent leader: "+(session.leader_name||"Unknown")+"\n\nOnly do this if the current leader is AFK or having connection issues."))return;let ok=await rpc("chain_take_lead",{p_session:S,p_player_id:me.id});await load();msg(ok?"You stole Chain Lead":"Could not take Chain Lead")}async function passLead(){if(!versionGuard())return;let sel=cq("#target"),raw=sel?.value||"",id=+raw,x=q.find(v=>+v.player_id===id);if(!leader())return msg("Only the Chain Leader can pass lead");if(!id||!x)return msg("Select a valid player to pass lead");if(id===me.id)return msg("Select another player to pass lead");if(!x.can_lead)return msg(x.player_name+" cannot lead — faction API permission required");let intendedId=id,intendedName=x.player_name;if(!confirm("Pass Chain Lead to "+intendedName+"?"))return;await load();if(!leader())return msg("Lead changed before pass — try again");if(!q.some(v=>+v.player_id===intendedId))return msg(intendedName+" is no longer in queue");let ok=await rpc("chain_pass_lead",{p_session:S,p_current_leader:me.id,p_new_leader:intendedId});if(ok!==true)ok=await rpc("chain_take_lead",{p_session:S,p_player_id:intendedId});await load();let passed=+session.leader_id===intendedId;msg(passed?"Chain lead passed to "+intendedName:"Pass Lead failed — leader is still "+(session.leader_name||"unknown"))}
async function join(){if(!me||!versionGuard())return;await rpc("chain_join_v2",{p_session:S,p_player_id:me.id,p_player_name:me.name,p_can_lead:canLead});await load();lastEnergyPush=0;await pushEnergy();msg(leader()?"Joined — you are Chain Leader":"Joined")}
async function leave(){if(!me)return;if(leader()&&q.length>1){msg("Pass Chain Lead before leaving");alert("You are the Chain Leader. Pass lead to another queued player first.");return}await rpc("chain_leave",{p_session:S,p_player_id:me.id});await load();msg("Left queue")}
let lastUiHitSignal=0;
async function signalAttackOutcome(){
 if(!me||!q.some(x=>+x.player_id===me.id)||Date.now()-lastUiHitSignal<4000)return;
 lastUiHitSignal=Date.now();
 let sid="ui:"+me.id+":"+Date.now();
 try{
   let changed=await rpc("chain_signal_hit_v2",{p_session:S,p_player_id:me.id,p_signal_id:sid,p_ended_at:Math.floor(tornNow()/1000)});
   if(changed){optimisticSnapshotTs=+session.chain_torn_timestamp||0;optimisticEndAt=tornNow()+300000;secs=300;localClock();render();msg(me.name+" hit → awaiting Torn chain snapshot")}
 }catch(e){await reportError("Instant hit signal",e,"chain_signal_hit");msg("Instant hit signal: "+(e?.message||"failed"))}
}
function installAttackOutcomeWatcher(){
 if(window.__cqOutcomeWatcher)return;window.__cqOutcomeWatcher=true;
 document.addEventListener("click",e=>{
   if(!location.href.includes("sid=attack"))return;
   let el=e.target?.closest?.('button,a,input[type="button"],input[type="submit"],div[role="button"],span[role="button"]');
   if(!el)return;
   let t=String(el.textContent||el.value||el.getAttribute("aria-label")||el.getAttribute("title")||"").replace(/\s+/g," ").trim().toLowerCase();
   if(t==="leave"||t==="mug"||t==="hospitalize"||t==="hospitalise")setTimeout(signalAttackOutcome,0)
 },true)
}
async function recordAttack(id,name,attackId,ended=null){if(!activeLoop||!cqOwnPoller())return false;let changed=await rpc("chain_record_attack",{p_session:S,p_player_id:+id,p_player_name:name||"Player",p_attack_id:attackId,p_ended_at:ended?+ended:null});if(changed)msg((name||"Player")+" hit → synced");return changed}
async function bottom(id,name,attackId=null,ended=null){return recordAttack(id,name,attackId,ended)}
function rows(j){if(!j||typeof j!=="object")return [];let v=j.attacks??j;return Array.isArray(v)?v:Object.values(v||{}).filter(x=>x&&typeof x==="object")}
function good(a){let id=+(a.attacker?.id||a.attacker_id||0),r=a.respect_gain??a.respect;if(!id)return false;if(r!=null)return +r>0;return !/lost|stalemate|escape/i.test(a.result||"")}
async function syncTimer(){return syncChainSnapshot()}
async function pushEnergy(){let p=myPos(),gap=p>0&&p<=5?60000:300000;if(!me||!q.some(x=>+x.player_id===me.id)||Date.now()-lastEnergyPush<gap)return;try{let j=await torn("/user/bars"),b=j.bars||j,e=b.energy||j.energy||j;if(e&&e.current!=null){await rpc("chain_energy",{p_session:S,p_player_id:me.id,p_current:+e.current,p_max:+(e.maximum??e.max??e.current)});lastEnergyPush=Date.now();diag.energy=true}else msg("Energy unavailable from Torn API") }catch(err){diag.energy=false;msg("Energy sync: "+(err?.message||"failed"))}}
function mine(a){return +(a.attacker?.id||a.attacker_id||0)===me?.id}
function cqAttackId(a){return String(a.id||a.attack_id||a.code||a.ended)}
function cqAttackTime(a){return +(a.ended||a.timestamp||0)}
async function cqAttackBackfill(scope,cursor,limit){
 // Torn API v2 idFilter makes from/to and sort operate on attack IDs.
 // Unlike timestamp pagination, it can cross a burst of >100 hits in one second.
 const cursorId=Number(cursor);
 if(!Number.isSafeInteger(cursorId)||cursorId<=0)return {found:false,first:null,records:[]};
 const seen=new Map();let to=null,first=null,found=false;
 for(let page=0;page<12;page++){
  if(!cqOwnPoller()||!activeLoop)return {found:false,first,records:[]};
  const path="/"+scope+"/attacks?limit="+limit+"&sort=DESC&filters=idFilter"+(to===null?"":"&to="+to);
  const raw=rows(await torn(path));
  if(!raw.length)break;
  if(first===null)first=cqAttackId(raw[0]);
  let oldest=null;
  for(const x of raw){
   const id=Number(cqAttackId(x));
   if(!Number.isSafeInteger(id)||id<=0)return {found:false,first,records:[]};
   if(oldest===null||id<oldest)oldest=id;
   if(id===cursorId){found=true;break}
   if(id>cursorId)seen.set(String(id),x);
  }
  if(found||raw.length<limit||oldest===null||oldest<=1)break;
  const next=oldest-1;
  if(to!==null&&next>=to)break;
  to=next;
 }
 if(!found)return {found:false,first,records:[]};
 return {found:true,first,records:[...seen.values()].filter(good).sort((x,y)=>cqAttackTime(x)-cqAttackTime(y)||Number(cqAttackId(x))-Number(cqAttackId(y)))};
}
async function pollMine(){
 if(!me||!q.some(x=>+x.player_id===me.id)||Date.now()-lastMinePoll<(session.leader_id&&Date.now()-Date.parse(session.leader_heartbeat_at||0)<30000?15000:6000))return;
 lastMinePoll=Date.now();
 const initial=rows(await torn("/user/attacks?limit=100&sort=DESC"));
 if(!initial.length)return;
 if(myAttackCursor==null){myAttackCursor=cqAttackId(initial[0]);return}
 const result=await cqAttackBackfill("user",myAttackCursor,100);
 if(!result.found){cqAttackGap=true;msg("PERSONAL ATTACK GAP — history incomplete; cursor preserved");diag.torn=false;paintDiag();return}
 const hits=result.records.filter(mine);
 for(const x of hits){if(!cqOwnPoller()||!activeLoop)return;await bottom(me.id,me.name,cqAttackId(x),cqAttackTime(x)||null)}
 myAttackCursor=result.first;
 if(hits.length){lastEnergyPush=0;await pushEnergy()}
}
async function pollLeader(){
 if(!leader()||Date.now()-lastLeaderPoll<4000)return;
 lastLeaderPoll=Date.now();
 const initial=rows(await torn("/faction/attacks?limit=100&sort=DESC"));
 if(!initial.length)return;
 const cursor=session.last_attack_id;
 if(!cursor){if(cqOwnPoller()&&activeLoop)await control("cursor",cqAttackId(initial[0]))}
 else{
  const result=await cqAttackBackfill("faction",cursor,100);
  if(!result.found){cqAttackGap=true;msg("FACTION ATTACK GAP — history incomplete; cursor preserved");diag.torn=false;paintDiag();return}
  for(const x of result.records){
   if(!cqOwnPoller()||!activeLoop||!leader())return;
   const pid=+(x.attacker?.id||x.attacker_id);
   await bottom(pid,x.attacker?.name||x.attacker_name,cqAttackId(x),cqAttackTime(x)||null)
  }
  if(result.records.length)lastChainSnapshotPoll=0;
 }
 if(cqOwnPoller()&&activeLoop&&Date.now()-lastHeartbeat>=15000){await control("heartbeat");lastHeartbeat=Date.now()}
}
async function maybeFailover(){if(leader()||!me||Date.now()-lastFailoverCheck<15000)return;let mine=q.find(x=>+x.player_id===me.id);if(!mine?.can_lead)return;lastFailoverCheck=Date.now();let t=Date.parse(session.leader_heartbeat_at||session.updated_at||0);if(session.leader_id&&Number.isFinite(t)&&Date.now()-t<45000)return;try{let won=await rpc("chain_claim_stale_lead",{p_session:S,p_player_id:me.id});if(won){await load();if(leader()){lastChainSnapshotPoll=0;await syncChainSnapshot();msg("Leader failover — you are Chain Lead")}}}catch(e){await reportError("Leader failover",e,"chain_claim_stale_lead")}}
function myPos(){return me?q.findIndex(x=>+x.player_id===me.id)+1:0}
function mineDelay(){let p=myPos();return leader()||p===1?2000:p>0&&p<=5?2000:p>0&&p<=20?5000:6000}
function sharedDelay(){let p=myPos();return leader()||p===1?2000:p>0&&p<=5?3000:p>0&&p<=20?5000:6000}
let cqPollInFlight=false,cqAttackGap=false;
async function pollFast(){
 window.__cqFast=null;
 if(cqPollInFlight)return;
 cqPollInFlight=true;
 if(!activeLoop||!session.active){cqPollInFlight=false;activeLoop=false;safeText("#st","IDLE");render();return}
 if(!cqOwnPoller()){cqPollInFlight=false;safeText("#st","MIRROR");localClock();render();return}
 try{
   let fp=myPos(),sharedFallback=!rtJoined?30000:(leader()||fp===1?60000:fp>1&&fp<=5?120000:300000);
   if(Date.now()-lastSharedLoad>=sharedFallback)try{await load()}catch(e){await reportError("Queue sync",e,"Supabase load");msg("Queue sync: "+(e?.message||"failed"))}
   if(!lastTornClockSync||Date.now()-lastTornClockSync>=300000)try{await syncTornClock()}catch(e){await reportError("Torn clock sync",e,"/faction/timestamp");msg("Torn clock sync: "+(e?.message||"failed"))}
   if(leader()&&!feedFresh()&&(!lastChainSnapshotPoll||Date.now()-lastChainSnapshotPoll>=30000))try{await syncChainSnapshot()}catch(e){lastChainSnapshotPoll=Date.now();await reportError("Chain snapshot",e,"/faction?selections=chain,timestamp");msg("Chain snapshot: "+(e?.message||"failed"))}
   try{await pushEnergy()}catch(e){diag.energy=false;await reportError("Energy sync",e,"/user/bars");msg("Energy sync: "+(e?.message||"failed"))}
   try{await pollMine()}catch(e){await reportError("Attack sync",e,"/user/attacks");msg("Attack sync: "+(e?.message||"failed"))}
   try{await maybeFailover()}catch(e){await reportError("Leader failover loop",e,"chain_claim_stale_lead")}
   if(leader())try{await pollLeader()}catch(e){await reportError("Leader sync",e,"/faction/attacks");if(factionPermissionError(e)){canLead=false;try{await rpc("chain_capability",{p_session:S,p_player_id:me.id,p_can_lead:false});await load()}catch{}msg("Faction API permission required — Chain Lead reassigned if possible")}else msg("Leader sync: "+(e?.message||"failed"))}
   localClock();apiFails=0;diag.torn=!cqAttackGap;safeText("#st",cqAttackGap?"ATTACK GAP":"LIVE");render()
 }catch(e){
   apiFails++;msg("Core loop: "+(e?.message||"failed"));localClock();render()
 }finally{
   cqPollInFlight=false;clearTimeout(window.__cqFast);if(activeLoop&&session.active&&cqOwnPoller())window.__cqFast=setTimeout(pollFast,mineDelay())
 }
}
async function connect(){try{cq("#st").textContent="CONNECTING";if(!(await checkVersion()))throw Error("Update required — install v"+versionState.latest);let pk=PDAK!=="###PDA-APIKEY###"?PDAK:"",k=pk||(cq("#ck")?.value||"").trim()||storeGet(KS);diag.key=!!k;if(!k)throw Error("Enter a Limited API key");if(!pk)storeSet(KS,k);let j=await torn("/user/basic"),u=j.profile||j;diag.torn=true;me={id:+(u.id||u.player_id),name:u.name};storeSet("cq_identity",JSON.stringify(me));if(!me.id)throw Error("Could not identify user");await selectFactionSession();await loadAdmins();await load();if(session.active){await startActiveLoop();msg(q.some(x=>+x.player_id===me.id)?"Connected — still in queue":"Connected — LIVE")}else{stopActiveLoop();msg(isAdmin()?"IDLE — press START SESSION when chaining/war starts":"IDLE — waiting for an admin to start a session");clearTimeout(window.__cqIdle);window.__cqIdle=setTimeout(checkForActiveSession,300000);await maybeAutoStart()}}catch(e){diag.torn=false;safeText("#st","ERROR");msg(e.message)}}
function render(){if(!$("#cq")){mount();return;}paintDiag();let ctl=cq(".sessionCtl");if(ctl)ctl.style.display=isAdmin()?"flex":"none";let sb=cq("#startsession"),eb=cq("#endsession");if(sb)sb.disabled=!!session.active;if(eb)eb.disabled=!session.active;if(!session.active)safeText("#st","IDLE");let n=q[0],newNext=n?+n.player_id:null,queueSig=q.map(x=>x.player_id).join(",");
if(lastQueueSig!==null&&queueSig!==lastQueueSig){
  if(newNext!==me?.id)tone("hit","hit:"+queueSig);
}
lastQueueSig=queueSig;lastNextId=newNext;cqAlertTick();let tr=+session.trigger_seconds||240,forced=!!n&&+session.manual_hit_player_id===+n.player_id&&session.manual_hit_at,hit=!!n&&!session.paused&&((count>0&&secs>0&&secs<=tr)||forced);safeText(".tm",fmt(secs));safeText(".chain",count>0?(count+"/"+(chainMax()||"?")):"—");safeText(".nx",n?n.player_name:"Nobody queued");safeText(".call",session.paused?"⏸ Queue paused":!n?"Waiting for players":count<=0&&!forced?"Waiting for chain":hit?(me&&+n.player_id===me.id?"🔥 YOU — HIT NOW":"🔥 "+n.player_name+" — HIT NOW"):"Next hit @ "+fmt(tr));let hero=cq(".hero");if(hero)hero.classList.toggle("hit",hit);let iq=me&&q.some(x=>+x.player_id===me.id),vb=versionState.blocked;cq("#join").disabled=vb||!me||iq;cq("#leave").disabled=!iq;let pace=Math.max(0,300-tr),eta=i=>i===0?"NOW":"~"+Math.ceil(i*pace/60)+"m",known=q.filter(x=>x.energy_current!=null),hits=known.reduce((s,x)=>s+Math.floor(+x.energy_current/25),0),es=$("#cq .energySummary");if(es)es.textContent="⚡ Queue energy: "+known.reduce((s,x)=>s+(+x.energy_current||0),0)+" E • "+hits+" hits available"+(known.length<q.length?" • "+(q.length-known.length)+" unknown":"");cq(".list").innerHTML=q.length?q.map((x,i)=>`<li class="${me&&+x.player_id===me.id?"me":""}"><span>${i+1}</span><b>${String(x.player_name).replace(/[<>]/g,"")}</b><span class="eta">${me&&+x.player_id===me.id?"YOU • "+eta(i):i===0?"NEXT":eta(i)}</span><span class="tag">${x.energy_current==null?"E ? • ? hits":"E "+x.energy_current+"/"+(x.energy_max||"?")+" • "+Math.floor(+x.energy_current/25)+" hits"}${roundOn()&&i===0?" • round "+(+x.round_hits||0)+"/"+roundN():""}</span></li>`).join(""):"<li><span>—</span><span>No active queue</span><span></span></li>";let esc=s=>String(s||"—").replace(/[<>]/g,""),cp=me?q.findIndex(x=>+x.player_id===me.id):-1,compact=cq(".compactRoster");if(compact){let labels=["NEXT","ON DECK","IN HOLE"],rows3=[0,1,2].map((i)=>'<div class="cr"><b>'+labels[i]+'</b><span>'+(q[i]?esc(q[i].player_name):"—")+'</span></div>').join(""),myEta=cp<0?"Not in queue":cp===0?"YOU: NEXT • NOW":"YOU: #"+(cp+1)+" • "+eta(cp);compact.innerHTML=rows3+'<div class="you">'+myEta+'</div>'}safeText(".lead",session.leader_name?"👑 Leader: "+session.leader_name:"⚠ No chain leader");cq(".admin").classList.toggle("on",leader());let targetSel=cq("#target"),selectedTarget=targetSel?.value||"";if(targetSel){let targetSig=q.map(x=>x.player_id+":"+x.player_name).join("|");if(targetSel.dataset.sig!==targetSig){targetSel.innerHTML=q.map(x=>`<option value="${+x.player_id}">${String(x.player_name).replace(/[<>]/g,"")}</option>`).join("");targetSel.dataset.sig=targetSig;if(selectedTarget&&q.some(x=>String(x.player_id)===selectedTarget))targetSel.value=selectedTarget}}cq("#tempo").value=String(tr);safeText("#pause",session.paused?"Resume":"Pause");cq("#takelead").disabled=!me||!iq||leader()||!canLead;let meta=$("#cq .panel>.meta");if(meta)meta.textContent="Chain: "+count+(me?" • "+me.name:"");let pos=me?q.findIndex(x=>+x.player_id===me.id)+1:0,b=cq(".bi");if(b){if(n&&me&&+n.player_id===me.id&&hit)b.textContent="🔥";else if(count>0&&secs>0&&secs<=30)b.textContent="⚠️";else if(pos)b.textContent=String(pos);else b.textContent="🔗"}if(count>0&&secs>0&&secs<=60&&!session.paused&&!hit)safeText(".call","⚠️ "+fmt(secs)+" — chain getting low");paintState(hit,n)}
// Timer colour states: safe above WARN_AT, warning down to CRIT_AT, critical below (anyone may save the chain).
const WARN_AT=150,CRIT_AT=90;
function timerState(){return count>0&&secs!=null&&secs>0?(secs<=CRIT_AT?"crit":secs<=WARN_AT?"warn":"safe"):"off"}
function paintState(hit,n){let st=timerState(),mine=!!(hit&&me&&n&&+n.player_id===me.id),h=cq(".hero"),b=cq(".bubble"),iq=!!me&&q.some(x=>+x.player_id===me.id),j=cq("#join"),l=cq("#leave"),s=cq("#st");if(h){h.dataset.state=st;h.classList.toggle("mine",mine)}safeText(".state",{safe:"SAFE",warn:"LOW",crit:"SAVE IT",off:session.active?"NO CHAIN":"IDLE"}[st]);if(b){b.dataset.state=st;if(st!=="off")safeText(".bi",(mine?"🔥 ":"")+(phone()&&session.active&&phaseOK()&&MODES[session.phase_mode]?MODES[session.phase_mode].split(" ")[0]+" ":"")+fmt(secs))}if(j)j.hidden=iq;if(l)l.hidden=!iq;if(s)s.dataset.s=s.textContent;paintSrc();paintAdmins();paintClaim();paintPhase();paintPhLine();paintAuto();paintRound()}
// Optional TCM feed (Settings): Torn City Manager polls /faction/chain on several members' keys in turn, so its reading
// is a few seconds old instead of up to 30 s. Count down from `end`, never `timeout`. Any error or stale reading falls
// back to the leader's own 30 s Torn poll. The chain leader also shares a newer reading through chain_apply_snapshot.
const TCM="https://torncitymanager.com",FS="chainQueue.tcmFeed",TS="chainQueue.tcmToken",FEED_MS=3000,FEED_STALE_MS=12000;let feed=null,feedErr="",lastFeedPush=0;
const feedOn=()=>storeGet(FS)==="1"&&!!storeGet(TS),feedFresh=()=>!!feed&&Date.now()-feed.at<FEED_STALE_MS&&feed.age<60,feedUsed=()=>feedFresh()&&feed.end>=(+session.chain_end_at||0),chainMax=()=>(feedUsed()?feed.max:+session.chain_max)||0;
async function pollFeed(){clearTimeout(window.__cqFeed);if(!feedOn()||!activeLoop||!session.active)return;if(!cqOwnPoller()){feed=null;window.__cqFeed=setTimeout(pollFeed,2000);return}let wait=FEED_MS;try{let j=await request(TCM+"/api/chain/feed",{headers:{"x-tcm-token":storeGet(TS)}}),c=j?.chain;feedErr="";if(c&&+c.end>0){feed={current:+c.current||0,max:+c.max||0,end:+c.end,age:+j.age||0,at:Date.now()};pushFeed().catch(e=>reportError("TCM feed share",e,"chain_apply_snapshot"))}else{feed=null;feedErr="no chain"}}catch(e){feed=null;let m=String(e?.status||"")+" "+String(e?.message||"");feedErr=/401|relink/.test(m)?"relink":/403/.test(m)?"off":/429/.test(m)?"slow":"error";if(feedErr==="relink"){storeSet(TS,"");storeSet(FS,"0");msg("TCM link expired. Turn the TCM timer on again to relink.")}else if(feedErr==="off"){storeSet(FS,"0");msg("TCM's chain feed isn't on for your faction")}wait=feedErr==="slow"?10000:FEED_MS*3}finally{localClock();render();if(feedOn()&&activeLoop)window.__cqFeed=setTimeout(pollFeed,wait)}}
async function pushFeed(){if(!cqOwnPoller()||!leader()||!feedFresh()||Date.now()-lastFeedPush<FEED_MS)return;if(feed.end<=(+session.chain_end_at||0)&&feed.current<=(+session.chain_count||0))return;lastFeedPush=Date.now();let ts=Math.floor(tornNow()/1000);await rpc("chain_apply_snapshot",{p_session:S,p_torn_timestamp:ts,p_current:feed.current,p_max:feed.max,p_end:feed.end,p_cooldown:0});Object.assign(session,{chain_torn_timestamp:ts,chain_count:feed.current,chain_max:feed.max,chain_end_at:feed.end,chain_cooldown_at:0,chain_timer_seconds:Math.max(0,Math.min(600,feed.end-ts)),chain_timer_synced_at:new Date().toISOString()})}
async function toggleFeed(){let box=cq("#tcmfeed");if(!box.checked){storeSet(FS,"0");storeSet(TS,"");feed=null;localClock();render();return msg("TCM timer off")}let pk=PDAK!=="###PDA-APIKEY###"?PDAK:"",k=pk||storeGet(KS);if(!k){box.checked=false;return msg("Connect your API key first")}if(!confirm("Use Torn City Manager's faster chain timer?\n\nYour API key is sent once to torncitymanager.com to link you. Only the token it returns is kept on this device. Your faction must have TCM's chain feed turned on."))return box.checked=false;try{let j=await request(TCM+"/api/script/link",{method:"POST",headers:{"x-torn-key":k}});if(!j?.token)throw Error("no token returned");storeSet(TS,j.token);storeSet(FS,"1");msg("Linked to TCM");pollFeed()}catch(e){box.checked=false;msg("TCM link failed: "+(e?.message||"error"))}}
function paintSrc(){let b=cq("#tcmfeed"),e=cq(".src");if(b&&document.activeElement!==b)b.checked=feedOn();if(!e)return;if(count<=0){e.textContent="";return}if(feedUsed()){e.textContent="via TCM · "+Math.round(feed.age+(Date.now()-feed.at)/1000)+"s old";e.title="TCM's pooled feed: several members' keys, a few seconds behind Torn"}else{let t=+session.chain_torn_timestamp||0,a=t?Math.max(0,Math.round(tornNow()/1000-t)):null;e.textContent="via Torn"+(a!=null?" · "+a+"s old":"")+(feedOn()&&feedErr?" · TCM "+feedErr:"");e.title="The leader's Torn API read. Torn caches it, so it can be up to 30 s older."}}
// Session admins: leaders, officers, and named watchers who may start and end sessions and set the phase banner,
// managed in the tool. Cloudy (OWNER_ID) is always an admin. Needs the proposed chain_session_admins migration; without
// it the list is hidden and only Cloudy can start a session, as before.
let admins=[],adminsOK=false;
const escH=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])),isAdmin=()=>!!me&&(me.id===OWNER_ID||admins.some(a=>+a.player_id===me.id));
async function loadAdmins(){if(S==="pending")return;try{let r=await db("chain_session_admins?session_id=eq."+encodeURIComponent(S)+"&select=player_id,player_name,role&order=role.asc",{method:"GET"});adminsOK=Array.isArray(r);admins=adminsOK?r:[]}catch{adminsOK=false;admins=[]}render()}
async function addAdmin(){if(!isAdmin())return;let f=cq("#admid"),id=+(f?.value||0),role=cq("#admrole")?.value||"watcher";if(!Number.isInteger(id)||id<=0)return msg("Enter a Torn player ID");try{let j=await torn("/user/"+id+"/basic"),u=j.profile||j;if(!u?.name)throw Error("player not found");let ok=await rpc("chain_admin_add",{p_session:S,p_player_id:me.id,p_admin_id:id,p_admin_name:String(u.name),p_role:role});msg(ok?u.name+" is now a session admin":"Could not add admin");if(ok)f.value="";await loadAdmins()}catch(e){msg("Add admin: "+(e?.message||"failed"))}}
async function removeAdmin(id){if(!isAdmin()||!confirm("Remove this session admin?"))return;try{let ok=await rpc("chain_admin_remove",{p_session:S,p_player_id:me.id,p_admin_id:id});msg(ok?"Admin removed":"Could not remove admin");await loadAdmins()}catch(e){msg("Remove admin: "+(e?.message||"failed"))}}
function paintAdmins(){let box=cq(".admins"),l=cq(".admlist");if(box)box.style.display=adminsOK&&isAdmin()?"block":"none";if(!l)return;let sig=admins.map(a=>a.player_id+":"+a.role).join("|");if(l.dataset.sig===sig)return;l.dataset.sig=sig;l.innerHTML=admins.map(a=>`<li><b>${escH(a.player_name)}</b><span class="tag">${escH(a.role)}</span><button data-rm="${+a.player_id}" title="Remove ${escH(a.player_name)}" aria-label="Remove ${escH(a.player_name)}">×</button></li>`).join("")||"<li>No admins yet</li>"}
// "Got it" save claim: below CRIT_AT anyone can claim the save in one tap, and everyone sees who has it until the claim
// expires (CLAIM_S) or a hit lifts the timer. Needs the proposed save_claim_* columns on chain_sessions; hidden without.
const CLAIM_S=60,claimsOK=()=>"save_claim_until" in session,claimLive=()=>claimsOK()&&!!session.save_claim_player_id&&Date.parse(session.save_claim_until||0)>Date.now();
async function claimSave(){if(!me||!claimsOK()||timerState()!=="crit")return;if(claimLive())return msg((session.save_claim_name||"Someone")+" already has it");try{let ok=await rpc("chain_claim_save",{p_session:S,p_player_id:me.id,p_player_name:me.name,p_seconds:CLAIM_S});if(ok){Object.assign(session,{save_claim_player_id:me.id,save_claim_name:me.name,save_claim_until:new Date(Date.now()+CLAIM_S*1000).toISOString()});msg("You have the save. Hit now.")}else{await load();msg("Someone else claimed it first")}render()}catch(e){await reportError("Save claim",e,"chain_claim_save");msg("Save claim: "+(e?.message||"failed"))}}
function paintClaim(){let c=cq(".claim");if(!c)return;let show=!!session.active&&!!me&&claimsOK()&&timerState()==="crit";c.hidden=!show;if(!show)return;let live=claimLive(),mineC=live&&+session.save_claim_player_id===me.id,left=live?Math.max(0,Math.ceil((Date.parse(session.save_claim_until)-Date.now())/1000)):0,b=cq("#claim"),t=cq(".claimby");if(b)b.hidden=live;let hp=cq(".claimhelp");if(hp)hp.hidden=live;if(t){t.hidden=!live;t.textContent=live?(mineC?"✋ You have the save · "+left+"s":"✋ "+session.save_claim_name+" has it · "+left+"s"):""}}
// Automatic session start: an idle admin client checks Torn (at most once every 4 minutes across all tabs) for a live
// ranked war, or for a faction chain at or past a threshold (auto_chain_min, default 25, 0 turns that part off), and asks
// the database to start the session. The database starts it for the first caller only, and not again for a war or chain
// whose session an admin has already ended, so several admins never produce duplicates. Admins can turn it off.
// Needs the proposed auto_start columns on chain_sessions; without them nothing happens.
const autoOK=()=>"auto_start" in session,AUTO_EVERY=240000;
async function rankedWarId(){let j=await torn("/faction/wars"),r=j?.wars?.ranked??j?.ranked,now=Math.floor(tornNow()/1000);return r&&+r.start<=now&&(!+r.end||+r.end>now)?+r.war_id||1:0}
async function autoTrigger(){let war=await rankedWarId();if(war)return "war:"+war;let min=+session.auto_chain_min||0;if(!min)return "";let j=await torn("/faction?selections=chain,timestamp"),c=j?.chain||{};return +c.current>=min&&+c.end>Math.floor(tornNow()/1000)?"chain:"+(c.start||c.id||Math.floor(Date.now()/864e5)):""}
async function maybeAutoStart(){if(!me||session.active||!autoOK()||session.auto_start===false||!isAdmin())return;try{let k="cq:autostart:"+S,last=+localStorage.getItem(k)||0;if(Date.now()-last<AUTO_EVERY)return;localStorage.setItem(k,String(Date.now()))}catch{}try{let key=await autoTrigger();if(!key)return;let ok=await rpc("chain_auto_start",{p_session:S,p_player_id:me.id,p_trigger:key});await load();if(ok||session.active){await startActiveLoop();msg(ok?(key.startsWith("war")?"Ranked war live – session started automatically":"Chain running – session started automatically"):"Session is active — LIVE")}}catch(e){await reportError("Auto start",e,"chain_auto_start");msg("Auto start: "+(e?.message||"failed"))}}
async function setAutoStart(){if(!isAdmin()||!autoOK())return;let on=!!cq("#autostart").checked,n=Math.max(0,Math.min(5000,Math.floor(+cq("#autochain").value)||0));try{let ok=await rpc("chain_set_auto_start",{p_session:S,p_player_id:me.id,p_on:on,p_chain_min:n});if(ok){Object.assign(session,{auto_start:on,auto_chain_min:n});delete cq(".autoctl").dataset.dirty;msg(!on?"Automatic start is off":n?"Sessions start automatically in ranked wars and when a chain reaches "+n:"Sessions start automatically in ranked wars")}else msg("Could not change the setting")}catch(e){msg("Auto start setting: "+(e?.message||"failed"))}render()}
// Round mode (buddy/dump): an admin switches the queue so a turn is a round of up to N hits instead of one hit. The
// database keeps count per player (chain_queue.round_hits) and only moves a player to the back when the round is done or
// they pass. Normal mode is the default. Needs the proposed queue_mode/round_size columns; hidden without them.
const roundOK=()=>"queue_mode" in session,roundOn=()=>roundOK()&&session.queue_mode==="round",roundN=()=>+session.round_size||10,myRow=()=>me?q.find(x=>+x.player_id===me.id):null;
function paintRound(){let rc=cq(".roundctl"),line=cq(".round"),pass=cq("#roundpass");if(rc){rc.hidden=!(roundOK()&&isAdmin());let m=cq("#qmode"),z=cq("#qsize");if(m&&z&&!rc.contains(document.activeElement)&&!rc.dataset.dirty){m.value=roundOn()?"round":"normal";z.value=roundN()}}let mine=roundOn()&&session.active?myRow():null;if(line){line.hidden=!mine;if(mine)line.textContent="Your round: "+(+mine.round_hits||0)+"/"+roundN()}if(pass)pass.hidden=!(mine&&+q[0]?.player_id===me.id)}
async function setQueueMode(){if(!isAdmin()||!roundOK())return;let m=cq("#qmode").value==="round"?"round":"normal",n=Math.max(1,Math.min(25,Math.floor(+cq("#qsize").value)||10));try{let ok=await rpc("chain_set_queue_mode",{p_session:S,p_player_id:me.id,p_mode:m,p_size:n});if(ok){Object.assign(session,{queue_mode:m,round_size:n});delete cq(".roundctl").dataset.dirty;msg(m==="round"?"Round mode: up to "+n+" hits a turn":"Normal queue: one hit a turn");await load()}else msg("Could not change the queue mode");render()}catch(e){msg("Queue mode: "+(e?.message||"failed"))}}
async function passRound(){if(!me||!roundOn()||+q[0]?.player_id!==me.id||!confirm("End your round and go to the back?"))return;try{let ok=await rpc("chain_round_pass",{p_session:S,p_player_id:me.id});await load();msg(ok?"Round passed – you are at the back":"Could not pass your round");render()}catch(e){msg("Pass round: "+(e?.message||"failed"))}}
// Phase banner: admins set the war mode and phase; while a session is live it shows across the top of every Torn page.
// Tap it to hide it until the phase changes. Needs the proposed phase_* columns on chain_sessions; hidden without them.
const MODES={real:"⚔ REAL FIGHT",termed:"🤝 TERMED",turtle:"🐢 TURTLE"},phaseOK=()=>"phase_mode" in session;
// Leaders' note: free text (140 characters at most) set by admins, shown with the phase. It is only ever put on the page
// as text, never as HTML. Needs the proposed leaders_note column; hidden without it.
const NOTE_MAX=140,notesOK=()=>"leaders_note" in session,notePart=()=>notesOK()&&session.leaders_note?"📝 "+session.leaders_note:"",phasePart=()=>phaseOK()&&MODES[session.phase_mode]?MODES[session.phase_mode]+(session.phase_text?" · "+session.phase_text:""):"",bannerText=()=>[phasePart(),notePart()].filter(Boolean).join(" – ");
function paintPhase(){let pc=cq(".phasectl"),bar=document.getElementById("cqbar"),sig=session.phase_mode+"|"+(session.phase_text||"")+"|"+(session.leaders_note||""),hid=false;if(pc){pc.style.display=(phaseOK()||notesOK())&&isAdmin()?"block":"none";let pm=cq("#phmode"),pt=cq("#phtext"),nt=cq("#ldnote"),nr=cq(".notectl");if(nr)nr.hidden=!notesOK();if(pm&&pt&&!pc.contains(document.activeElement)&&!pc.dataset.dirty){pm.value=session.phase_mode||"";pt.value=session.phase_text||"";if(nt)nt.value=session.leaders_note||""}}try{hid=sessionStorage.getItem("cqbar.hidden")===sig}catch{}if(!session.active||!bannerText()||hid){if(bar)bar.hidden=true;return}if(!bar){bar=document.createElement("div");bar.id="cqbar";bar.setAttribute("role","status");bar.title="Tap to hide until the phase changes";bar.onclick=()=>{try{sessionStorage.setItem("cqbar.hidden",bar.dataset.sig)}catch{}bar.hidden=true};document.body.appendChild(bar)}let t=bannerText();bar.hidden=false;if(MODES[session.phase_mode])bar.dataset.mode=session.phase_mode;else delete bar.dataset.mode;bar.dataset.sig=sig;if(bar.textContent!==t)bar.textContent=t;if(phone()){if(bar.dataset.seen!==sig){bar.dataset.seen=sig;clearTimeout(window.__cqBarT);window.__cqBarT=setTimeout(()=>{bar.dataset.done=sig;bar.hidden=true},5000)}if(bar.dataset.done===sig)bar.hidden=true}}
function paintAuto(){let l=cq(".autoctl"),c=cq("#autostart"),n=cq("#autochain");if(!l)return;l.hidden=!(autoOK()&&isAdmin());if(c)c.checked=session.auto_start!==false;if(n&&!l.contains(document.activeElement)&&!l.dataset.dirty)n.value=session.auto_chain_min==null?25:session.auto_chain_min}
function paintPhLine(){let e=cq(".phline");if(!e)return;let on=session.active&&phasePart(),n=cq(".ldnote"),nn=session.active&&notePart();e.hidden=!on;if(on)e.textContent=phasePart();if(n){n.hidden=!nn;n.textContent=nn||""}}
async function setNote(){if(!isAdmin()||!notesOK())return;let t=(cq("#ldnote")?.value||"").replace(/[\u0000-\u001f\u007f]/g," ").trim().slice(0,NOTE_MAX);try{let ok=await rpc("chain_set_note",{p_session:S,p_player_id:me.id,p_text:t||null});if(ok){session.leaders_note=t||null;delete cq(".phasectl").dataset.dirty;msg(t?"Leaders' note set":"Leaders' note cleared")}else msg("Could not set the note");render()}catch(e){msg("Set note: "+(e?.message||"failed"))}}
async function setPhase(){if(!isAdmin()||!phaseOK())return;let m=cq("#phmode")?.value||"",t=(cq("#phtext")?.value||"").trim().slice(0,80);try{let ok=await rpc("chain_set_phase",{p_session:S,p_player_id:me.id,p_mode:m||null,p_text:t||null});if(ok){Object.assign(session,{phase_mode:m||null,phase_text:t||null});delete cq(".phasectl").dataset.dirty;msg(m?"Phase banner set":"Phase banner cleared")}else msg("Could not set the phase");render()}catch(e){msg("Set phase: "+(e?.message||"failed"))}}
window.addEventListener("error",e=>{let m=e.message||"error";if(/ResizeObserver loop/i.test(m))return;diag.last="JS: "+m;paintDiag()});window.addEventListener("unhandledrejection",e=>{diag.last="Promise: "+(e.reason?.message||e.reason||"error");paintDiag()});new MutationObserver(()=>{if(!document.querySelector("#cq")&&document.body){mount();render()}}).observe(document.documentElement,{childList:true,subtree:true});installAttackOutcomeWatcher();mount();
(async function boot(){
 restoreIdentity();
 let saved=storeGet(KS);
 if(saved){cq("#ck").value=saved;connect()}
 else if(me){render();msg("API key needed to connect")}
})()
})();
