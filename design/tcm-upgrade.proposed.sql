-- PROPOSED, NOT APPLIED. For Cloudy to review and apply to the Chain Manager database.
-- Written against the live schema as seen from the client (select=* on chain_sessions and chain_queue), then re-checked
-- against fix/coordinated-polling-v036 (its design/*.dev.sql and supabase/functions/chain-coordinator). The bodies of
-- the existing chain_* functions were not read, so check names and types before running.
--
-- Security model: these follow the current public RPC model, where the caller supplies its own player id. That is
-- spoofable, like chain_set_active's owner check today (see design/live-supabase-security-audit-2026-11-09.md).
-- v036's gateway already routes set_active; this branch makes it call chain_is_admin (see below). Add gateway actions
-- for chain_admin_add, chain_admin_remove, chain_set_phase, and chain_claim_save too (verified id, like join and
-- take_lead), and include them in the cutover that revokes anon/authenticated EXECUTE on the legacy mutating RPCs.
-- The client still calls these four directly, as it does chain_set_active today, until the client moves to the gateway.
--
-- The client feature-detects all of this: without the table it hides the admin list, and without the new
-- chain_sessions columns it hides the save claim and the phase banner. Applying it before the client ships is safe.

-- (b) Session admins ---------------------------------------------------------------------------------------------

create table if not exists public.chain_session_admins (
  session_id  text        not null,
  player_id   bigint      not null,
  player_name text        not null check (char_length(player_name) between 1 and 40),
  role        text        not null check (role in ('leader', 'officer', 'watcher')),
  added_by    bigint      not null,
  added_at    timestamptz not null default now(),
  primary key (session_id, player_id)
);
alter table public.chain_session_admins enable row level security;
create policy "public admin list read" on public.chain_session_admins for select using (true);
-- No write policies: writes go through the functions below only.

-- Cloudy (4315564) is always an admin, matching the existing owner check.
create or replace function public.chain_is_admin(p_session text, p_player_id bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select p_player_id = 4315564
      or exists (select 1 from chain_session_admins where session_id = p_session and player_id = p_player_id)
$$;
revoke execute on function public.chain_is_admin(text, bigint) from public, anon, authenticated;
-- The gateway calls it with the service role key, and the other functions below call it as their definer.
grant execute on function public.chain_is_admin(text, bigint) to service_role;

create or replace function public.chain_admin_add(p_session text, p_player_id bigint, p_admin_id bigint, p_admin_name text, p_role text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not chain_is_admin(p_session, p_player_id) then return false; end if;
  if p_role not in ('leader', 'officer', 'watcher') or p_admin_id <= 0 then return false; end if;
  if (select count(*) from chain_session_admins where session_id = p_session) >= 30 then return false; end if;
  insert into chain_session_admins (session_id, player_id, player_name, role, added_by)
  values (p_session, p_admin_id, left(p_admin_name, 40), p_role, p_player_id)
  on conflict (session_id, player_id) do update set player_name = excluded.player_name, role = excluded.role;
  return true;
end $$;

create or replace function public.chain_admin_remove(p_session text, p_player_id bigint, p_admin_id bigint)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not chain_is_admin(p_session, p_player_id) or p_admin_id = 4315564 then return false; end if;
  delete from chain_session_admins where session_id = p_session and player_id = p_admin_id;
  return found;
end $$;

grant execute on function public.chain_admin_add(text, bigint, bigint, text, text) to anon, authenticated;
grant execute on function public.chain_admin_remove(text, bigint, bigint) to anon, authenticated;

-- And in the existing chain_set_active(p_session, p_player_id, p_active): replace the owner equality check with
--   if not chain_is_admin(p_session, p_player_id) then return false; end if;
-- The v036 gateway's set_active (supabase/functions/chain-coordinator/index.ts) is changed on this branch to accept the
-- owner or chain_is_admin(session, verified id). That gateway check alone is not enough: chain_set_active still checks
-- the owner inside the database, so the one-line change above is needed for both paths.

-- (c) "Got it" save claim -----------------------------------------------------------------------------------------
-- Lives on chain_sessions so the existing Realtime UPDATE subscription delivers it to every client instantly.
-- First claim wins until it expires; the where clause makes that atomic.

alter table public.chain_sessions
  add column if not exists save_claim_player_id bigint,
  add column if not exists save_claim_name      text,
  add column if not exists save_claim_until     timestamptz;

create or replace function public.chain_claim_save(p_session text, p_player_id bigint, p_player_name text, p_seconds integer)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update chain_sessions
     set save_claim_player_id = p_player_id,
         save_claim_name      = left(p_player_name, 40),
         save_claim_until     = now() + make_interval(secs => least(greatest(coalesce(p_seconds, 60), 15), 120))
   where session_id = p_session
     and active
     and (save_claim_until is null or save_claim_until < now());
  return found;
end $$;
grant execute on function public.chain_claim_save(text, bigint, text, integer) to anon, authenticated;

-- (d) Phase banner ------------------------------------------------------------------------------------------------
-- Also on chain_sessions, for the same Realtime reason. Admin-only.

alter table public.chain_sessions
  add column if not exists phase_mode   text check (phase_mode in ('real', 'termed', 'turtle')),
  add column if not exists phase_text   text check (char_length(phase_text) <= 80),
  add column if not exists phase_set_by bigint,
  add column if not exists phase_set_at timestamptz;

create or replace function public.chain_set_phase(p_session text, p_player_id bigint, p_mode text, p_text text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not chain_is_admin(p_session, p_player_id) then return false; end if;
  if p_mode is not null and p_mode not in ('real', 'termed', 'turtle') then return false; end if;
  update chain_sessions
     set phase_mode = p_mode, phase_text = nullif(left(trim(p_text), 80), ''), phase_set_by = p_player_id, phase_set_at = now()
   where session_id = p_session;
  return found;
end $$;
grant execute on function public.chain_set_phase(text, bigint, text, text) to anon, authenticated;

-- Optional: in chain_set_active, clear phase_mode and phase_text when p_active is false, so the next session does not
-- open with the last war's banner.

-- (3b+) Automatic session start in a ranked war, or when the chain passes a threshold ----------------------------------
-- An idle admin client sees a live ranked war on Torn (GET /v2/faction/wars, wars.ranked with start <= now and no end), or
-- a faction chain of at least auto_chain_min hits that is still running (GET /v2/faction?selections=chain), and calls
-- chain_auto_start with a trigger key ("war:<war id>" or "chain:<chain start>"). The single UPDATE below is the
-- de-duplication: its where clause lets exactly one caller through, so several admins' clients never start two sessions.
-- It never restarts a session for a trigger it has already started once, so an admin who ends the session during the war
-- or chain is not overridden. Starting goes through chain_set_active, so any setup that function does still happens.
-- Admins can switch the setting off per session, and set the chain length (default 25, 0 turns the chain trigger off).

alter table public.chain_sessions
  add column if not exists auto_start         boolean not null default true,
  add column if not exists auto_chain_min     integer not null default 25 check (auto_chain_min between 0 and 5000),
  add column if not exists auto_started_key   text;

create or replace function public.chain_auto_start(p_session text, p_player_id bigint, p_trigger text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not chain_is_admin(p_session, p_player_id) or p_trigger !~ '^(war|chain):[0-9]{1,15}$' then return false; end if;
  update chain_sessions
     set auto_started_key = p_trigger
   where session_id = p_session
     and not active
     and auto_start
     and auto_started_key is distinct from p_trigger;
  if not found then return false; end if;
  return coalesce(chain_set_active(p_session, p_player_id, true), false);
end $$;

create or replace function public.chain_set_auto_start(p_session text, p_player_id bigint, p_on boolean, p_chain_min integer)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not chain_is_admin(p_session, p_player_id) then return false; end if;
  update chain_sessions
     set auto_start = coalesce(p_on, true), auto_chain_min = least(greatest(coalesce(p_chain_min, 25), 0), 5000)
   where session_id = p_session;
  return found;
end $$;

grant execute on function public.chain_auto_start(text, bigint, text) to anon, authenticated;
grant execute on function public.chain_set_auto_start(text, bigint, boolean, integer) to anon, authenticated;

-- (3d+) Leaders' note on the phase banner -----------------------------------------------------------------------------
-- Free text, 140 characters at most, admin-only, on chain_sessions so Realtime delivers it with the phase. The client only
-- ever renders it as text. Control characters are replaced by spaces here as well.

alter table public.chain_sessions
  add column if not exists leaders_note    text check (char_length(leaders_note) <= 140),
  add column if not exists leaders_note_by bigint,
  add column if not exists leaders_note_at timestamptz;

create or replace function public.chain_set_note(p_session text, p_player_id bigint, p_text text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not chain_is_admin(p_session, p_player_id) then return false; end if;
  update chain_sessions
     set leaders_note    = nullif(left(trim(regexp_replace(coalesce(p_text, ''), '[[:cntrl:]]', ' ', 'g')), 140), ''),
         leaders_note_by = p_player_id,
         leaders_note_at = now()
   where session_id = p_session;
  return found;
end $$;
grant execute on function public.chain_set_note(text, bigint, text) to anon, authenticated;
-- Optional: clear leaders_note in chain_set_active when p_active is false, like phase_*.

-- (3d2) Buddy/dump queue mode ----------------------------------------------------------------------------------------
-- In round mode a queue turn is a ROUND of up to round_size hits. The player at the front keeps their place until their
-- round is done or they pass, then moves to the back. Normal mode (the default) is unchanged. Per-player progress lives on
-- chain_queue so the existing queue select and Realtime deliver it ("your round: k/10").

alter table public.chain_sessions
  add column if not exists queue_mode text not null default 'normal' check (queue_mode in ('normal', 'round')),
  add column if not exists round_size integer not null default 10 check (round_size between 1 and 25);
alter table public.chain_queue
  add column if not exists round_hits integer not null default 0;

create or replace function public.chain_set_queue_mode(p_session text, p_player_id bigint, p_mode text, p_size integer)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not chain_is_admin(p_session, p_player_id) or p_mode not in ('normal', 'round') then return false; end if;
  update chain_sessions set queue_mode = p_mode, round_size = least(greatest(coalesce(p_size, 10), 1), 25)
   where session_id = p_session;
  update chain_queue set round_hits = 0 where session_id = p_session;
  return found;
end $$;

-- Called from inside the existing hit-recording function (chain_record_attack) where it now moves the hitter to the back.
-- Returns true when the hitter should move to the back: always in normal mode; in round mode only once their round is
-- full, and the count then resets for their next turn.
create or replace function public.chain_round_should_rotate(p_session text, p_player_id bigint)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_mode text; v_size integer; v_hits integer;
begin
  select queue_mode, round_size into v_mode, v_size from chain_sessions where session_id = p_session;
  if v_mode is distinct from 'round' then return true; end if;
  update chain_queue set round_hits = round_hits + 1
   where session_id = p_session and player_id = p_player_id returning round_hits into v_hits;
  if v_hits is null then return true; end if;
  if v_hits >= v_size then
    update chain_queue set round_hits = 0 where session_id = p_session and player_id = p_player_id;
    return true;
  end if;
  return false;
end $$;
-- In chain_record_attack, replace the unconditional "move the hitter to the back" with
--   if chain_round_should_rotate(p_session, p_player_id) then <the existing move-to-back> end if;
-- chain_signal_hit_v2 (the instant hit signal) needs the same wrapper if it also moves the queue.

-- The player at the front ends their own round early and goes to the back.
create or replace function public.chain_round_pass(p_session text, p_player_id bigint)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_front bigint;
begin
  select player_id into v_front from chain_queue where session_id = p_session order by position asc, joined_at asc limit 1;
  if v_front is distinct from p_player_id
     or (select queue_mode from chain_sessions where session_id = p_session) is distinct from 'round' then return false; end if;
  update chain_queue
     set position = (select coalesce(max(position), 0) + 1 from chain_queue where session_id = p_session), round_hits = 0
   where session_id = p_session and player_id = p_player_id;
  return found;
end $$;

grant execute on function public.chain_set_queue_mode(text, bigint, text, integer) to anon, authenticated;
grant execute on function public.chain_round_pass(text, bigint) to anon, authenticated;
revoke execute on function public.chain_round_should_rotate(text, bigint) from public, anon, authenticated;
-- chain_round_should_rotate is called from other security definer functions only.
