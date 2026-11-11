<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## TrimTime architecture rules

- Browser roles (anon/authenticated) are read-only under RLS; every insert/update/delete goes through Supabase Edge Functions using service_role after verifying the caller's JWT, role and shop ownership. Why: one audited write path, no client-side privilege escalation.
- RLS helper and SECURITY DEFINER functions live in the `private` schema (not exposed to the Data API); never put them in `public`. Why: keeps them uncallable via RPC.
- Customers read barber data only through the `public_barbers` view; the `barbers` table has no anon access. Why: hides user_id and account data.
- Booking price, duration and ends_at are derived from the service by the `bookings_before_write` trigger; double-booking is blocked by the `bookings_no_barber_overlap` exclusion constraint (`tstzrange(starts_at, ends_at, '[)')`, non-cancelled only). Why: the database, not app code, is the source of truth for integrity.
- Edge Functions use `public.check_rate_limit(bucket, key_hash, max, window_seconds)` with hashed IP/mobile keys. Why: Supabase has no built-in rate limiter.
