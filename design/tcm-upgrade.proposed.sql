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
