# TrimTime — MVP Implementation Plan (revised)

## Confirmed decisions
- Supabase Edge Functions handle all secure booking logic (no built-in server functions).
- Bookings are automatically confirmed after server-side validation and successful database insert.
- Multiple barbers per shop, each with an individual calendar.
- Customers choose a specific barber or "Any Available Barber".
- Every booking stores barber_id; overlaps for the same barber are blocked by a PostgreSQL constraint, while different barbers in one shop can be booked at the same time.

## 1. Requirements summary
- Bilingual (English LTR / Arabic RTL) booking site for barber shops inside gated communities in Dammam, with a language switcher on every screen.
- Phase 1: guests book without an account (name, mobile, building, apartment), pick service, barber (or Any), date and time; booking is confirmed instantly; guests cancel securely via a private link.
- Barber dashboard: secure login; manage shop details, services, prices, durations, working hours, breaks, holidays; view, cancel, reschedule bookings.
- Admin dashboard: manage communities, shops, barber accounts; view bookings across communities.
- Phase 2 (later): customer app, accounts, history, offers, loyalty.
- Excluded from MVP: online payments, SMS OTP, automated WhatsApp.

## 2. Architecture
```text
Browser (React + TypeScript, EN/AR, RTL/LTR)
  | public: communities -> shop -> service -> barber or Any -> date/slot -> details -> confirmed
  | /barber/*  signed-in barbers and shop managers
  | /admin/*   signed-in admins
  v
Supabase Edge Functions (existing project)
  - get-availability     slots for one barber or for "Any"
  - create-booking       validate, assign barber, insert as confirmed
  - cancel-booking       cancel via secret token
  - reschedule-booking   barber/manager moves a booking (time and/or barber)
  - admin-create-barber  admin creates barber login accounts
  v
PostgreSQL (existing Supabase project) + Auth + Row Level Security
```
- Frontend in this project; reads of public catalogue data go directly to the database under RLS; all booking writes go through Edge Functions.
- Edge Functions use the service key only on the server; the browser never gets elevated access.
- Backend: your existing Supabase project, connected by you in Settings -> External Supabase. No second project.
- Source control: your existing private `trimtime` repo via Settings -> GitHub (linking an existing repo may need a manual step on your side). Edge Function code lives in the repo's Supabase functions folder.
- i18n: en/ar dictionaries, `<html dir lang>` switching, logical spacing (start/end) everywhere, Arabic-friendly font pair, bilingual name fields in the database.
- Times stored in UTC, displayed in Asia/Riyadh.

## 3. Database tables and relationships
| Table | Key fields | Relationships |
|---|---|---|
| communities | id, name_en, name_ar, slug, is_active | 1-N shops |
| shops | id, community_id, name_en/ar, description_en/ar, phone, location_note, slot_interval_min, is_active | belongs to community; 1-N barbers, services |
| user_roles | user_id, role (admin, shop_manager, barber) | separate table, never on profiles |
| shop_managers | shop_id, user_id | manager accounts for a shop |
| barbers | id, shop_id, user_id (unique, nullable -> auth user), name_en/ar, photo_url, is_active | belongs to shop; links to barber login account |
| services | id, shop_id, name_en/ar, price_sar, duration_min, is_active, sort | belongs to shop |
| barber_services | barber_id, service_id | which barbers perform which services |
| working_hours | barber_id, weekday, open_time, close_time | per-barber weekly schedule |
| breaks | barber_id, weekday, start_time, end_time | per-barber breaks |
| holidays | shop_id, barber_id (nullable), date, reason | whole-shop closure or one barber's day off |
| bookings | id, community_id, shop_id, barber_id (NOT NULL -> barbers), service_id, requested_any_barber (bool), price_sar, duration_min, starts_at, ends_at, status (confirmed, cancelled, completed, no_show), customer_name, customer_mobile, building, apartment, language, manage_token_hash, created_at, cancelled_at | belongs to community, shop, barber, service |

Integrity rules:
- Overlap constraint: `EXCLUDE USING gist (barber_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&) WHERE (status <> 'cancelled')` (btree_gist extension). The half-open [) range means a booking ending at 10:30 does not conflict with one starting at 10:30, so back-to-back appointments are allowed. Same barber cannot be double-booked, even with simultaneous requests; different barbers are independent.
- Trigger checks: barber belongs to the booking's shop, shop belongs to the booking's community, barber offers the service, ends_at = starts_at + duration.
- Price and duration copied onto the booking so later price changes don't alter history.

## 4. Slot calculation and booking workflow
Availability for one barber on a date:
1. Start from that barber's working hours for the weekday.
2. Remove breaks, shop holidays and the barber's days off.
3. Remove existing non-cancelled bookings for that barber.
4. Generate start times every slot_interval_min where the full service duration fits; hide past times and enforce a minimum lead time.

"Any Available Barber": run the above for every active barber who offers the service; a time is shown if at least one barber is free.

create-booking:
1. Validate input (Saudi mobile 05XXXXXXXX, required fields, lengths, service active, date within booking window), rate-limit per mobile/shop.
2. Recompute availability server-side (never trust the browser).
3. Specific barber: insert for that barber. Any: order free barbers by fewest bookings that day, try insert; on overlap-constraint error, try the next barber.
4. On success, save status = confirmed, return booking summary, assigned barber and secret manage link. If no barber remains free, return "slot just taken" and the customer picks again.

Cancel: token hashed and matched; cut-off (e.g. 1 hour before) enforced. Reschedule (barber side): same validation and constraint; may move to another barber in the shop.

## 5. Security
- RLS on every table with explicit grants.
- Public: read active communities, shops, services, hours, and barbers only through a restricted `public_barbers` view (id, shop_id, name_en/ar, photo_url, services offered). The barbers table itself has no public access, so user_id and account details are never exposed. No public access to bookings.
- All booking inserts/updates only via Edge Functions.
- Protected Edge Functions (reschedule-booking, staff cancel, admin-create-barber, every dashboard write) verify the caller login token on every request, then check role and shop ownership (own calendar, manager shop, or admin) before acting; otherwise return 401/403.
- Public functions (get-availability, create-booking, cancel-booking) validate every input with a schema (IDs, dates within booking window, Saudi mobile format, text lengths, sanitised text) and reject anything else.
- Rate limits: Supabase has no built-in rate limiter, so a small database-backed limiter counts requests per IP and per mobile in a time window (e.g. 5 bookings/hour per mobile, 60 availability checks/minute per IP). A practical safeguard, not full abuse protection; an external limiter can be added later.
- The service role key lives only in Edge Function secrets: never in frontend code, committed env files, GitHub or logs. The frontend uses only the publishable key; .env files are git-ignored.
- Barbers see only their own calendar and bookings; shop managers see all barbers in their shop; admins see all communities. Role checks via a security-definer `has_role` function, never client-side.
- Public sign-up disabled; barber accounts created by admins.
- Customer mobile and apartment visible only to that shop's staff and admins. Manage links use random tokens stored only as hashes.

## 6. Phases (2–3 day MVP)
- Day 1: connect Supabase, schema + constraints + RLS + seed data (1 community, 2 shops, several barbers), design system, EN/AR + RTL, public browse pages.
- Day 1–2: Edge Functions (availability, create, cancel), barber picker with Any, slot picker, booking form, confirmation and cancel pages.
- Day 2: barber dashboard — login, shop details, barbers and their services, per-barber hours/breaks/days off, per-barber day calendar, cancel and reschedule.
- Day 3: admin dashboard — communities, shops, barber accounts, cross-community bookings with filters; QA in both languages and on mobile; publish.
- Phase 2: customer app and accounts, history, offers/loyalty, notifications — reusing the same database and RLS.

## 7. Technical risks
- No OTP: fake bookings/no-shows — mitigate with rate limits, one active booking per mobile per shop, no-show marking.
- Lost manage link: clear display, copy button, manual WhatsApp share link.
- Simultaneous "Any" bookings: handled by the database constraint plus retry.
- Edge Functions deploy separately from the frontend and add a little latency on cold start.
- RTL edge cases (icons, date pickers, mixed digits): logical CSS, test every screen in Arabic.
- Existing Supabase project may already contain tables/policies — inspect before migrating.
- Linking the existing GitHub repo may need a manual step.
- Free-tier limits are fine for MVP volumes.
