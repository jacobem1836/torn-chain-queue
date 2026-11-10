# Coordinator Edge Function (STAGING ONLY)

This function is committed on the draft feature branch. It is **not deployed**, and the existing userscript does not call it.

## Existing user flow
The existing Torn API key is submitted to the `verify` action via HTTPS. The function checks `/v2/user/basic` and `/v2/user/faction`, derives player/faction from Torn (never from browser input), and returns a signed credential valid for five minutes. The API key is not stored by this function.

`claim` accepts the signed credential and a random UUID lease token and invokes a service-role-only RPC. A single token can renew the lease; an expired lease can be taken over.

## Staging setup
1. Create a **separate** Supabase project, with its own database and secrets. Do not point staging at the production project URL.
2. Apply `design/chain_poll_lease.dev.sql` to staging only after creating the needed `chain_sessions` table in staging. The SQL is a proposal, not a production migration.
3. Configure `COORDINATOR_SIGNING_SECRET` with at least 32 unpredictable characters; Supabase provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` server-side. Never put the service-role key in the userscript.
4. Deploy `chain-coordinator` only to staging. If invoking without Supabase Auth, configure the function's gateway JWT verification appropriately; the function itself verifies Torn credentials and its own HMAC token.
5. Call `verify` with `{"action":"verify","torn_api_key":"..."}`, then `claim` with `{"action":"claim","token":"<returned credential>","lease_token":"<random UUID>"}`. Never check real keys into tests or logs.

## Not ready for production
- No server-side **fencing** of authoritative attack/snapshot writes yet.
- No integration with the existing userscript or UI.
- No deployed staging environment or completed integration tests.
- No request-level abuse protection / per-key and per-IP verification throttling.
- The current function validates membership in an enrolled faction, but does not yet enforce additional coordinator eligibility rules or a maximum number of verification requests.
- Five-minute credentials require renewal by re-verifying the key, subject to Torn API limits.
- Cross-origin policy and TornPDA HTTP transport require explicit staging tests.
- Reconfirm Torn API v2 response shapes and required key access levels against real test keys.
- Ensure private RPC and table grants are verified on staging and are not callable using the publishable key.

## Mandatory checks
- Invalid/expired Torn keys; missing faction permissions; non-enrolled faction; malformed token.
- Tampered credential; wrong signature; expired credential; expired lease token.
- Simultaneous claimers (one winner), renewal, takeover, and stale writer rejection.
- Verify API keys never appear in logs, database rows, telemetry, or URLs.

## Admins (this branch)
`set_active` accepts the owner (`CHAIN_OWNER_TORN_ID`) or anyone for whom `chain_is_admin(session, id)` is true. That function comes from `design/tcm-upgrade.proposed.sql`; until it exists only the owner passes (non-owner calls fail with 502). `chain_set_active` must also use `chain_is_admin` inside the database.

## New actions to add to the gateway (not yet routed)
Like `chain_admin_add`, `chain_set_phase`, and `chain_claim_save`, the client still calls these directly until the client moves to the gateway. When it does, add gateway actions that pass the verified id as `p_player_id` and include them in the cutover that revokes the public grants:
- `chain_auto_start(session, verified id, war id)` and `chain_set_auto_start(session, verified id, on)`. Admin only, checked inside the functions through `chain_is_admin`. `chain_auto_start` is one atomic update, so concurrent admins cannot start two sessions, and it only ever starts the session, never ends it. The client calls it from an idle admin client at most once every 4 minutes across tabs (the Torn read of `/faction/wars` is done by the client with the member's own key; it does not use the poll lease because no session is live to lease).
- `chain_set_note(session, verified id, text)`. Admin only, checked inside the function. Add it beside `chain_set_phase`.
