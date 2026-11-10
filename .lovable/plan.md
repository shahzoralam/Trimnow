# TrimTime — MVP Implementation Plan

## 1. Requirements summary
- Bilingual (English LTR / Arabic RTL) booking site for barber shops inside gated communities in Dammam.
- Phase 1: guests book without an account (name, mobile, building, apartment), then confirm or cancel through a private link.
- Barbers sign in to manage their shop, services, hours, breaks, holidays and bookings.
- Admins manage communities, shops, barber accounts and see all bookings.
- Out of scope for MVP: payments, SMS OTP, WhatsApp automation, customer accounts, mobile app.

## 2. Architecture
```text
Browser (EN/AR, RTL/LTR)
   |  public pages: communities -> shops -> services -> slot -> confirm
   |  /barber/*   (signed-in barber)
   |  /admin/*    (signed-in admin)
   v
Server functions (booking, slot calculation, cancel-by-token, account creation)
   v
Your existing Supabase project (Postgres + Auth + Row Level Security)
```
- Frontend: React + TypeScript (this project's built-in framework), Tailwind, shadcn UI.
- Backend: your existing Supabase project, connected by you in Settings -> External Supabase. No new project is created.
- Server logic: this project's built-in server functions instead of Supabase Edge Functions (same security, deploys with the app, no separate deploy step). Tell me if Edge Functions are a hard requirement.
- Source control: connect your existing `trimtime` repo via Settings -> GitHub. Note: Lovable's GitHub connection normally creates a repo; linking an existing one may require importing it — to confirm when connecting.
- i18n: lightweight dictionary (en.json / ar.json), language in the URL or a cookie, `<html dir="rtl" lang="ar">` switching, Arabic-friendly font (e.g. IBM Plex Sans Arabic + a matching Latin font), Tailwind logical spacing (ms/me/ps/pe) everywhere.
- Times stored in UTC, displayed in Asia/Riyadh.

## 3. Database tables
| Table | Key fields | Relationships |
|---|---|---|
| communities | id, name_en, name_ar, slug, area, is_active | — |
| shops | id, community_id, name_en/ar, description_en/ar, phone, location_note, slot_interval_min, is_active | community 1-N shops |
| shop_members | shop_id, user_id | links barber accounts to shops |
| user_roles | user_id, role (admin, barber) | separate table, never on profile |
| services | id, shop_id, name_en/ar, price_sar, duration_min, is_active, sort | shop 1-N services |
| working_hours | shop_id, weekday, open_time, close_time | per weekday |
| breaks | shop_id, weekday, start_time, end_time | per weekday |
| holidays | shop_id, date, reason | closed dates |
| bookings | id, community_id, shop_id, service_id, starts_at, ends_at, customer_name, customer_mobile, building, apartment, status (pending/confirmed/cancelled/completed), manage_token_hash, language, created_at | belongs to shop + community + service |

Double-booking prevention: Postgres exclusion constraint on `bookings` (shop_id + time range overlap, where status not cancelled). The database itself rejects overlapping bookings, even under simultaneous requests. A trigger ensures `bookings.community_id` always matches the shop's community.

## 4. Security
- Row Level Security on every table; explicit grants per role.
- Public can read only active communities, shops, services and hours. Public cannot read bookings at all.
- Guests create bookings only through a server function that validates input (Saudi mobile format 05XXXXXXXX, lengths), recomputes availability and price server-side, and rate-limits by mobile/shop.
- Confirm/cancel uses a random secret link; only its hash is stored. Cancellation cut-off (e.g. 1 hour before) enforced server-side.
- Barbers see and edit only rows for their own shops (via shop_members). Admins checked with a `has_role` security-definer function — never client-side.
- Barber accounts created by admins only (public signup disabled).
- Customer personal data (mobile, apartment) visible only to that shop's barbers and admins.

## 5. Phases (2–3 day MVP)
- Day 1 — Foundation: connect Supabase, schema + RLS + seed data (1 community, 2 shops), design system, EN/AR + RTL layout, language switcher, public browse pages.
- Day 1–2 — Booking flow: slot calculator (hours − breaks − holidays − existing bookings), booking form, confirmation page with manage link, cancel page.
- Day 2 — Barber dashboard: login, shop details, services, hours/breaks/holidays, bookings list (today/upcoming), cancel and reschedule.
- Day 3 — Admin dashboard: communities, shops, barber account invites, cross-community bookings with filters; QA in both languages, mobile layout check, publish.
- Phase 2 (later): customer accounts and history, offers/loyalty, SMS/WhatsApp notifications, mobile app (can reuse the same database and RLS).

## 6. Technical risks
- No OTP means fake/no-show bookings: mitigate with rate limits, one active booking per mobile per shop, barber can mark no-show.
- Guests lose their manage link: show it clearly, offer "copy link" and WhatsApp share button (manual, not automated).
- RTL edge cases (icons, date pickers, mixed Arabic/number text): use logical CSS and test every screen in Arabic.
- Timezone/DST: Saudi has no DST, but store UTC and convert consistently.
- Existing Supabase project may already have tables/policies: I'll inspect before migrating to avoid conflicts.
- Existing GitHub repo linking may need a manual step on your side.
- Free tier limits (DB size, auth emails) — fine for MVP volumes.

## Decisions for you to confirm
1. OK to use built-in server functions instead of Supabase Edge Functions?
2. Should new bookings be auto-confirmed, or require barber confirmation?
3. One barber per shop (single calendar) for MVP, or multiple barbers each with their own calendar?
